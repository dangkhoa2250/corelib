//! Background PDF text indexing using a resource-limited local worker.
//!
//! `lopdf` decodes a page before it can expose text, so its page-level API cannot enforce an
//! output cap before allocating decoded content. The app therefore runs that untrusted parsing in
//! a separate local executable instance. The worker has OS-enforced address-space, data, and CPU
//! limits; the parent also caps its pipe read and kills a worker that exceeds the wall-clock
//! deadline. A worker failure maps to the existing ready/failed index state without taking down
//! the app process.

use std::{
    env,
    ffi::OsStr,
    fs,
    io::{Read, Write},
    panic::{catch_unwind, AssertUnwindSafe},
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use lopdf::Document;

use crate::library_db::LibraryDatabase;

pub const MAX_PDF_INPUT_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_PDF_PAGE_COUNT: usize = 256;
pub const MAX_EXTRACTED_TEXT_BYTES: usize = 4 * 1024 * 1024;
const PDF_TEXT_WORKER_ARGUMENT: &str = "--pdf-text-extract-worker";
const MAX_WORKER_DATA_BYTES: u64 = 64 * 1024 * 1024;
const MAX_WORKER_ADDRESS_SPACE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_WORKER_CPU_SECONDS: u64 = 3;
const MAX_WORKER_WALL_CLOCK: Duration = Duration::from_secs(5);
const WORKER_POLL_INTERVAL: Duration = Duration::from_millis(10);

pub fn index_managed_pdf(database: &Arc<Mutex<LibraryDatabase>>, id: &str, path: &Path) {
    index_document_with(database, id, path, extract_pdf_text);
}

pub fn index_document_with<F>(
    database: &Arc<Mutex<LibraryDatabase>>,
    id: &str,
    path: &Path,
    extract: F,
) where
    F: FnOnce(&Path) -> Result<String, String>,
{
    let extracted = catch_unwind(AssertUnwindSafe(|| extract(path)))
        .unwrap_or_else(|_| Err("PDF text extraction failed".to_owned()));

    if let Ok(mut database) = database.lock() {
        match extracted {
            Ok(text) => {
                let _ = database.set_index_ready(id, &text, None);
            }
            Err(_) => {
                let _ = database.set_index_failed(id);
            }
        }
    }
}

pub(crate) fn extract_pdf_text(path: &Path) -> Result<String, String> {
    #[cfg(test)]
    {
        extract_pdf_text_in_worker(path)
    }

    #[cfg(not(test))]
    {
        let worker = env::current_exe().map_err(|_| extraction_error())?;
        extract_pdf_text_with_worker(path, &worker)
    }
}

/// Runs PDF extraction through a supplied local worker executable.
///
/// The desktop binary uses itself as the worker. This public entry point lets the integration
/// regression exercise the same isolation protocol with a small worker-only binary.
pub fn extract_pdf_text_with_worker(path: &Path, worker: &Path) -> Result<String, String> {
    validate_pdf_input_size(path)?;
    let mut child = Command::new(worker)
        .arg(PDF_TEXT_WORKER_ARGUMENT)
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| extraction_error())?;
    let stdout = child.stdout.take().ok_or_else(extraction_error)?;
    let (output_sender, output_receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let _ = output_sender.send(read_worker_output(stdout));
    });
    let started = Instant::now();
    let mut output = None;

    loop {
        match output_receiver.try_recv() {
            Ok(Ok(bytes)) => output = Some(bytes),
            Ok(Err(())) => return kill_worker(&mut child),
            Err(mpsc::TryRecvError::Disconnected) => return kill_worker(&mut child),
            Err(mpsc::TryRecvError::Empty) => {}
        }
        let status = match child.try_wait() {
            Ok(status) => status,
            Err(_) => return kill_worker(&mut child),
        };
        match status {
            Some(status) => {
                if !status.success() {
                    return Err(extraction_error());
                }
                let bytes = match output {
                    Some(bytes) => bytes,
                    None => match output_receiver.recv_timeout(Duration::from_secs(1)) {
                        Ok(Ok(bytes)) => bytes,
                        Ok(Err(())) | Err(_) => return Err(extraction_error()),
                    },
                };
                return String::from_utf8(bytes).map_err(|_| extraction_error());
            }
            None if started.elapsed() >= MAX_WORKER_WALL_CLOCK => return kill_worker(&mut child),
            None => thread::sleep(WORKER_POLL_INTERVAL),
        }
    }
}

/// Handles the worker argument before the desktop runtime initializes.
pub fn run_pdf_text_extraction_worker() -> Option<i32> {
    let mut arguments = env::args_os();
    arguments.next();
    if arguments.next().as_deref() != Some(OsStr::new(PDF_TEXT_WORKER_ARGUMENT)) {
        return None;
    }
    let Some(path) = arguments.next() else {
        return Some(1);
    };
    if arguments.next().is_some() {
        return Some(1);
    }
    let status = apply_worker_limits()
        .and_then(|()| extract_pdf_text_in_worker(Path::new(&path)))
        .and_then(|text| {
            std::io::stdout()
                .write_all(text.as_bytes())
                .map_err(|_| extraction_error())
        });
    Some(if status.is_ok() { 0 } else { 1 })
}

fn validate_pdf_input_size(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if !metadata.is_file() || metadata.len() > MAX_PDF_INPUT_BYTES as u64 {
        return Err("PDF text extraction failed".to_owned());
    }
    Ok(())
}

fn extract_pdf_text_in_worker(path: &Path) -> Result<String, String> {
    validate_pdf_input_size(path)?;
    let document = Document::load(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if document.is_encrypted() {
        return Err("PDF text extraction failed".to_owned());
    }
    let pages = document.get_pages();
    if pages.len() > MAX_PDF_PAGE_COUNT {
        return Err("PDF text extraction failed".to_owned());
    }

    let mut extracted = String::new();
    for page in pages.into_keys() {
        let page_text = document
            .extract_text(&[page])
            .map_err(|_| "PDF text extraction failed".to_owned())?;
        if extracted
            .len()
            .checked_add(page_text.len())
            .is_none_or(|length| length > MAX_EXTRACTED_TEXT_BYTES)
        {
            return Err("PDF text extraction failed".to_owned());
        }
        extracted.push_str(&page_text);
    }
    Ok(extracted)
}

fn read_worker_output(mut stdout: impl Read) -> Result<Vec<u8>, ()> {
    let mut output = Vec::with_capacity(MAX_EXTRACTED_TEXT_BYTES);
    let mut chunk = [0_u8; 8192];
    loop {
        let read = stdout.read(&mut chunk).map_err(|_| ())?;
        if read == 0 {
            return Ok(output);
        }
        if output
            .len()
            .checked_add(read)
            .is_none_or(|length| length > MAX_EXTRACTED_TEXT_BYTES)
        {
            return Err(());
        }
        output.extend_from_slice(&chunk[..read]);
    }
}

fn kill_worker(child: &mut std::process::Child) -> Result<String, String> {
    let _ = child.kill();
    let _ = child.wait();
    Err(extraction_error())
}

#[cfg(unix)]
fn apply_worker_limits() -> Result<(), String> {
    let data_limit = libc::rlimit {
        rlim_cur: MAX_WORKER_DATA_BYTES,
        rlim_max: MAX_WORKER_DATA_BYTES,
    };
    let address_space_limit = libc::rlimit {
        rlim_cur: MAX_WORKER_ADDRESS_SPACE_BYTES,
        rlim_max: MAX_WORKER_ADDRESS_SPACE_BYTES,
    };
    let cpu_limit = libc::rlimit {
        rlim_cur: MAX_WORKER_CPU_SECONDS,
        rlim_max: MAX_WORKER_CPU_SECONDS + 1,
    };
    // These are per-process OS limits, so a decoder expansion cannot consume the app's memory.
    if unsafe { libc::setrlimit(libc::RLIMIT_DATA, &data_limit) } != 0
        || unsafe { libc::setrlimit(libc::RLIMIT_AS, &address_space_limit) } != 0
        || unsafe { libc::setrlimit(libc::RLIMIT_CPU, &cpu_limit) } != 0
    {
        return Err(extraction_error());
    }
    Ok(())
}

#[cfg(not(unix))]
fn apply_worker_limits() -> Result<(), String> {
    // Fail closed on platforms without this worker's hard resource-limit implementation.
    Err(extraction_error())
}

fn extraction_error() -> String {
    "PDF text extraction failed".to_owned()
}
