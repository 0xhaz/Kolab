use anchor_lang::prelude::*;

use crate::state::Config;

/// Program time. In `demo-clock` builds the admin-set offset lets the demo fast-forward review
/// windows and deadlines; release builds ignore the offset entirely.
pub fn now(config: &Config) -> Result<i64> {
    let ts = Clock::get()?.unix_timestamp;
    #[cfg(feature = "demo-clock")]
    {
        Ok(ts.saturating_add(config.demo_offset))
    }
    #[cfg(not(feature = "demo-clock"))]
    {
        let _ = config;
        Ok(ts)
    }
}
