pub use plotters;
use std::env;
use std::path::Path;

pub fn get_static_file(filename: &str) -> Result<String, Box<dyn std::error::Error>> {
    Ok(format!("{}/{}", env::var("OX_HUGO_STATIC")?, filename))
}

pub fn get_static_file_url(filename: &str) -> Result<String, Box<dyn std::error::Error>> {
    let org_dir = &env::var("ORG_DIR")?;
    let org_dir = Path::new(&org_dir);
    let full_path = Path::new(filename);
    Ok(format!(
        "file:../{}",
        full_path
            .strip_prefix(org_dir)?
            .to_str()
            .unwrap()
            .trim_start_matches('/')
    ))
}

pub fn print_org_file_link(filename: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("[[{}]]", get_static_file_url(filename)?);
    Ok(())
}
