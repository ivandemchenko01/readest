// Fork patch: upstream uses `cfg!(target_os = "windows")`, which checks the
// HOST in a build script. Cross-compiling for Android from Windows then links
// advapi32 into the .so and fails. Check the TARGET instead.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
