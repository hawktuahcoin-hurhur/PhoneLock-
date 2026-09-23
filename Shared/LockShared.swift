import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

/// State shared between the app and its extensions through the App Group container.
enum AppGroup {
    static let id: String =
        Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String ?? "group.com.example.phonelock"

    static var defaults: UserDefaults { UserDefaults(suiteName: id) ?? .standard }
}

enum SharedKey {
    static let selection = "lock.selection"
    static let lockEnabled = "lock.enabled"
    static let goalMetDay = "lock.goalMetDay"
    static let passUntil = "lock.passUntil"
    static let remaining = "lock.remaining"
}

extension ManagedSettingsStore.Name {
    static let phoneLock = Self("phonelock")
}

extension DeviceActivityName {
    static let daily = Self("phonelock.daily")
    static let pass = Self("phonelock.pass")
}

enum DayKey {
    static func string(for date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// Applies or removes the shield on the user's chosen apps. Safe to call from any process.
enum LockEngine {
    static let store = ManagedSettingsStore(named: .phoneLock)

    static func loadSelection() -> FamilyActivitySelection {
        guard let data = AppGroup.defaults.data(forKey: SharedKey.selection),
              let sel = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return FamilyActivitySelection() }
        return sel
    }

    static func saveSelection(_ selection: FamilyActivitySelection) {
        if let data = try? JSONEncoder().encode(selection) {
            AppGroup.defaults.set(data, forKey: SharedKey.selection)
        }
    }

    static var lockEnabled: Bool {
        get { AppGroup.defaults.object(forKey: SharedKey.lockEnabled) as? Bool ?? true }
        set { AppGroup.defaults.set(newValue, forKey: SharedKey.lockEnabled) }
    }

    static var goalMetToday: Bool {
        AppGroup.defaults.string(forKey: SharedKey.goalMetDay) == DayKey.string()
    }

    static var passUntil: Date? {
        get { AppGroup.defaults.object(forKey: SharedKey.passUntil) as? Date }
        set { AppGroup.defaults.set(newValue, forKey: SharedKey.passUntil) }
    }

    static var passActive: Bool {
        guard let until = passUntil else { return false }
        return until > Date()
    }

    /// Human-readable progress left for today, written by the app and shown on the shield.
    static var remainingText: String {
        get { AppGroup.defaults.string(forKey: SharedKey.remaining) ?? "Finish today's study goal to unlock." }
        set { AppGroup.defaults.set(newValue, forKey: SharedKey.remaining) }
    }

    static var shouldLock: Bool { lockEnabled && !goalMetToday && !passActive }

    /// Re-evaluates the rules and applies or clears the shield accordingly.
    static func refresh() {
        shouldLock ? applyShield() : clearShield()
    }

    static func applyShield() {
        let sel = loadSelection()
        store.shield.applications = sel.applicationTokens.isEmpty ? nil : sel.applicationTokens
        store.shield.applicationCategories = sel.categoryTokens.isEmpty ? nil : .specific(sel.categoryTokens)
        store.shield.webDomains = sel.webDomainTokens.isEmpty ? nil : sel.webDomainTokens
        store.shield.webDomainCategories = sel.categoryTokens.isEmpty ? nil : .specific(sel.categoryTokens)
    }

    static func clearShield() {
        store.clearAllSettings()
    }
}
