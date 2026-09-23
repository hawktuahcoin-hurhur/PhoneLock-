import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen iOS shows when you open a locked app.
final class PhoneLockShield: ShieldConfigurationDataSource {
    private func make() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 0.05, green: 0.05, blue: 0.12, alpha: 0.9),
            icon: UIImage(systemName: "lock.fill"),
            title: ShieldConfiguration.Label(text: "Study first 📚", color: .white),
            subtitle: ShieldConfiguration.Label(text: LockEngine.remainingText, color: UIColor(white: 0.8, alpha: 1)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "OK, I'll go study", color: .white),
            primaryButtonBackgroundColor: UIColor(red: 0.49, green: 0.36, blue: 1.0, alpha: 1)
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration { make() }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { make() }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { make() }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { make() }
}
