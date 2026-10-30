import Foundation

/// How long a packet for one contact may wait on a node. Only three steps, on purpose: the node
/// sees the lifetime that was asked for, so a free-form value would tell chats apart.
public enum MessageTtl {
    public static let stepsHours = [1, 6, 24]
    public static let defaultHours = 24

    /// Anything that is not a step becomes the default.
    public static func normalize(_ hours: Int?) -> Int {
        if let hours, stepsHours.contains(hours) { return hours }
        return defaultHours
    }

    public static func toMillis(_ hours: Int?) -> Int64 {
        Int64(normalize(hours)) * 3_600_000
    }
}
