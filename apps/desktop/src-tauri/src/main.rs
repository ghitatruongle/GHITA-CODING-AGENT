#![windows_subsystem = "windows"]

use std::panic;

fn main() {
    // Set up panic hook for crash logging in release builds
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("unnamed");

        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Box<dyn Any>".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        let backtrace = std::backtrace::Backtrace::force_capture();

        eprintln!(
            "[GHITA PANIC] Thread '{}': {}\n  at {}\n\nBacktrace:\n{}",
            thread_name, payload, location, backtrace
        );

        // Call the default hook for standard behavior
        default_hook(info);
    }));

    ghita_coding_agent_lib::run()
}
