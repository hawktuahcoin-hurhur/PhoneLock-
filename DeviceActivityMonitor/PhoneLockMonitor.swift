import DeviceActivity
import Foundation

/// Runs in the background (even when PhoneLock is closed) whenever a monitored schedule starts or ends.
/// - `.daily` starts at midnight every day: a new day means the goal is unmet, so apps lock again.
/// - `.pass` ends when an emergency pass expires: apps re-lock unless the goal was finished meanwhile.
final class PhoneLockMonitor: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        LockEngine.refresh()
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        if activity == .pass {
            LockEngine.passUntil = nil
        }
        LockEngine.refresh()
    }
}
