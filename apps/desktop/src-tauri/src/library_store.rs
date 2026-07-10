use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};
use uuid::Uuid;

pub struct ImportedPdf {
    pub managed_path: String,
    pub created: bool,
}

pub fn validate_pdf_input(path: impl AsRef<Path>) -> io::Result<()> {
    open_pdf_input(path.as_ref()).map(|_| ())
}

pub fn content_hash(path: impl AsRef<Path>) -> io::Result<String> {
    let mut source = open_pdf_input(path.as_ref())?;
    hash_open_pdf(&mut source)
}

pub fn import_pdf(
    library_root: impl AsRef<Path>,
    source_path: impl AsRef<Path>,
    supplied_content_hash: &str,
) -> io::Result<String> {
    Ok(import_pdf_with_status(library_root, source_path, supplied_content_hash)?.managed_path)
}

pub fn import_pdf_with_status(
    library_root: impl AsRef<Path>,
    source_path: impl AsRef<Path>,
    supplied_content_hash: &str,
) -> io::Result<ImportedPdf> {
    import_pdf_with_status_and_copier(
        library_root,
        source_path,
        supplied_content_hash,
        |source, destination| io::copy(source, destination).map(|_| ()),
    )
}

pub(crate) fn import_pdf_with_status_and_copier<F>(
    library_root: impl AsRef<Path>,
    source_path: impl AsRef<Path>,
    supplied_content_hash: &str,
    mut copier: F,
) -> io::Result<ImportedPdf>
where
    F: FnMut(&mut File, &mut File) -> io::Result<()>,
{
    let mut source = open_pdf_input(source_path.as_ref())?;
    let trusted_content_hash = hash_open_pdf(&mut source)?;
    if supplied_content_hash != trusted_content_hash {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "provided content hash does not match source",
        ));
    }

    let documents_directory = library_root.as_ref().join("documents");
    fs::create_dir_all(&documents_directory)?;

    let managed_path = documents_directory.join(format!("{trusted_content_hash}.pdf"));
    if managed_path.try_exists()? {
        return Ok(ImportedPdf {
            managed_path: managed_path.to_string_lossy().into_owned(),
            created: false,
        });
    }

    source.seek(SeekFrom::Start(0))?;
    let (temporary_path, mut destination) = create_temporary_document(&documents_directory)?;
    let copy_result = copier(&mut source, &mut destination).and_then(|_| destination.sync_all());
    drop(destination);

    let import_result = copy_result.and_then(|_| {
        if managed_path.try_exists()? {
            Ok(false)
        } else {
            fs::rename(&temporary_path, &managed_path).map(|_| true)
        }
    });

    match import_result {
        Ok(created) => {
            if !created {
                let _ = fs::remove_file(&temporary_path);
            }
            Ok(ImportedPdf {
                managed_path: managed_path.to_string_lossy().into_owned(),
                created,
            })
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary_path);
            Err(error)
        }
    }
}

fn open_pdf_input(path: &Path) -> io::Result<File> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "PDF input must be a regular file",
        ));
    }

    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut source = options.open(path)?;
    if !source.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "PDF input must be a regular file",
        ));
    }

    let mut header = [0; 5];
    source.read_exact(&mut header)?;
    if header != *b"%PDF-" {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "PDF input does not have a PDF header",
        ));
    }

    source.seek(SeekFrom::Start(0))?;
    Ok(source)
}

fn hash_open_pdf(source: &mut File) -> io::Result<String> {
    source.seek(SeekFrom::Start(0))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8 * 1024];

    loop {
        let bytes_read = source.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn create_temporary_document(documents_directory: &Path) -> io::Result<(PathBuf, File)> {
    for _ in 0..10 {
        let path = documents_directory.join(format!(".{}.tmp", Uuid::new_v4()));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not create a unique temporary PDF path",
    ))
}
