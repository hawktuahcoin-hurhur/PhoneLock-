import Foundation
import FamilyControls
import DeviceActivity
import ManagedSettings

/// App-side wrapper around Screen Time: authorization, choosing apps, and background schedules.
@MainActor
final class LockManager: ObservableObject {
    @Published private(set) var authorized = AuthorizationCenter.shared.authorizationStatus == .approved
    @Published var selection: FamilyActivitySelection = LockEngine.loadSelection()
    @Published var lockEnabled: Bool = LockEngine.lockEnabled
    @Published var errorMessage: String?

    private let center = DeviceActivityCenter()

    var lockedCount: Int {
        selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
    }

    var isLocked: Bool { authorized && lockedCount > 0 && LockEngine.shouldLock }

    var passUntil: Date? { LockEngine.passActive ? LockEngine.passUntil : nil }

    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
            errorMessage = "Screen Time permission is needed to lock apps: \(error.localizedDescription)"
        }
        authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        if authorized { startDailySchedule() }
    }

    func refreshStatus() {
        authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        if authorized { startDailySchedule() }
        LockEngine.refresh()
        objectWillChange.send()
    }

    func save(selection newValue: FamilyActivitySelection) {
        selection = newValue
        LockEngine.saveSelection(newValue)
        LockEngine.refresh()
    }

    func setLockEnabled(_ enabled: Bool) {
        lockEnabled = enabled
        LockEngine.lockEnabled = enabled
        LockEngine.refresh()
    }

    /// A repeating all-day schedule; its start at midnight lets the monitor extension re-lock for the new day.
    func startDailySchedule() {
        guard !center.activities.contains(.daily) else { return }
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )
        do {
            try center.startMonitoring(.daily, during: schedule)
        } catch {
            errorMessage = "Couldn't schedule the daily re-lock: \(error.localizedDescription)"
        }
    }

    /// Temporarily unlocks apps. The monitor extension re-locks when the interval ends (minimum 15 minutes).
    func startPass(minutes: Int) {
        let now = Date()
        let end = now.addingTimeInterval(TimeInterval(max(15, minutes) * 60))
        LockEngine.passUntil = end
        LockEngine.refresh()

        let cal = Calendar.current
        let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: cal.dateComponents(parts, from: now),
            intervalEnd: cal.dateComponents(parts, from: end),
            repeats: false
        )
        center.stopMonitoring([.pass])
        do {
            try center.startMonitoring(.pass, during: schedule)
        } catch {
            errorMessage = "Pass started, but background re-lock failed to schedule. Open PhoneLock to re-lock."
        }
        objectWillChange.send()
    }
}
