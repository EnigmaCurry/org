pub use plotters;
use std::env;
use std::error::Error;
use std::fs;
use std::path::Path;

pub fn get_static_file(filename: &str) -> Result<String, Box<dyn Error>> {
    let static_dir = env::var("OX_HUGO_STATIC")?;
    let full_path = Path::new(&static_dir).join(filename);
    if let Some(parent) = Path::new(&full_path).parent() {
        fs::create_dir_all(parent)?;
    }
    full_path
        .to_str()
        .ok_or_else(|| "Path string is invalid".into())
        .map(|s| s.to_string())
}

pub fn print_org_file_link(filename: &str) -> Result<(), Box<dyn Error>> {
    println!("[[file:{filename}]]");
    Ok(())
}
