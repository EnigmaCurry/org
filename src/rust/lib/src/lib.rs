pub use plotters;
//use std::env;
use std::fs;
use std::path::Path;

pub fn get_static_file(filename: &str) -> Result<String, Box<dyn std::error::Error>> {
    let filename = format!("static/{filename}");
    if let Some(parent) = Path::new(&filename).parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(filename)
}

pub fn get_static_file_url(filename: &str) -> Result<String, Box<dyn std::error::Error>> {
    // let org_dir = &env::var("ORG_DIR")?;
    // let org_dir = Path::new(&org_dir);
    // let full_path = Path::new(filename);
    // Ok(format!(
    //     "file:../{}",
    //     full_path
    //         .strip_prefix(org_dir)?
    //         .to_str()
    //         .unwrap()
    //         .trim_start_matches('/')
    // ))
    let full_path = Path::new(filename);
    Ok(format!("file:{}", full_path.canonicalize()?.display()))
}

pub fn print_org_file_link(filename: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("[[{}]]", get_static_file_url(filename)?);
    Ok(())
}
