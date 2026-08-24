fn main() {
    tauri_build::build();

    // Test harness binaries don't get tauri-build's embedded manifest (bin
    // targets only), so on Windows the static TaskDialogIndirect import
    // (tauri-plugin-dialog -> rfd) binds to comctl32 v5.82 and every test
    // binary dies with STATUS_ENTRYPOINT_NOT_FOUND before any test runs.
    // Attach a Common-Controls v6 manifest to every target; the content is
    // identical to tauri-build's windows-app-manifest.xml, so the duplicate
    // resource in bin targets is harmless. The unscoped link-arg form is
    // required because rustc-link-arg-tests does not reach the lib unit-test
    // harness.
    #[cfg(target_os = "windows")]
    match std::env::var("CARGO_CFG_TARGET_ENV").as_deref() {
        Ok("msvc") => println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' publicKeyToken='6595b64144ccf1df' language='*' processorArchitecture='*'"
        ),
        Ok("gnu") => {
            use std::process::Command;

            const MANIFEST_XML: &str = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" publicKeyToken="6595b64144ccf1df" language="*" processorArchitecture="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
"#;

            let out_dir =
                std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"));
            std::fs::write(out_dir.join("test_common_controls.manifest"), MANIFEST_XML)
                .expect("failed to write test manifest");
            std::fs::write(
                out_dir.join("test_common_controls.rc"),
                "1 24 \"test_common_controls.manifest\"\n",
            )
            .expect("failed to write test manifest resource script");
            let obj = out_dir.join("test_common_controls.o");
            let compiled = ["x86_64-w64-mingw32-windres", "windres"].into_iter().any(|w| {
                Command::new(w)
                    .args(["-O", "coff", "-o", "test_common_controls.o", "test_common_controls.rc"])
                    .current_dir(&out_dir)
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false)
            });
            assert!(
                compiled && obj.exists(),
                "windres is required on windows-gnu to embed the Common-Controls manifest into test binaries"
            );
            println!("cargo:rustc-link-arg={}", obj.display());
        }
        _ => {}
    }
}
