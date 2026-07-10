use std::{
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

use sha2::{Digest, Sha256};

pub struct ImportedPdf {
    pub managed_path: String,
    pub created: bool,
}

pub fn validate_pdf_input(path: impl AsRef<Path>) -> io::Result<()> {
    let path = path.as_ref();
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "PDF input must be a regular file",
        ));
    }

    let mut source = File::open(path)?;
    let mut header = [0; 5];
    source.read_exact(&mut header)?;
    if header != *b"%PDF-" {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "PDF input does not have a PDF header",
        ));
    }

    Ok(())
}

pub fn content_hash(path: impl AsRef<Path>) -> io::Result<String> {
    let path = path.as_ref();
    validate_pdf_input(path)?;
    let mut source = File::open(path)?;
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
    let trusted_content_hash = content_hash(source_path.as_ref())?;
    if supplied_content_hash != trusted_content_hash {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "provided content hash does not match source",
        ));
    }

    let documents_directory = library_root.as_ref().join("documents");
    fs::create_dir_all(&documents_directory)?;

    let managed_path = documents_directory.join(format!("{trusted_content_hash}.pdf"));
    let created = !managed_path.exists();
    if created {
        fs::copy(source_path, &managed_path)?;
    }

    Ok(ImportedPdf {
        managed_path: managed_path.to_string_lossy().into_owned(),
        created,
    })
}
