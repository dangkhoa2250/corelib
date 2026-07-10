use std::{
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

use sha2::{Digest, Sha256};

pub fn content_hash(path: impl AsRef<Path>) -> io::Result<String> {
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
    content_hash: &str,
) -> io::Result<String> {
    let documents_directory = library_root.as_ref().join("documents");
    fs::create_dir_all(&documents_directory)?;

    let managed_path = documents_directory.join(format!("{content_hash}.pdf"));
    if !managed_path.exists() {
        fs::copy(source_path, &managed_path)?;
    }

    Ok(managed_path.to_string_lossy().into_owned())
}
