import Foundation

/// Lock-out arithmetic of the PIN pad, ported from the companion object of Android's `PinManager`.
public enum PinLockout {
    private static let freeTries = 4
    private static let firstLockMs: Int64 = 30_000
    private static let maxLockMs: Int64 = 60 * 60 * 1000

    /// Pause after the `fails`-th wrong try in a row: none for the first four, then 30 s, 60 s,
    /// 2 min ... up to 1 h.
    public static func lockDelayMs(fails: Int) -> Int64? {
        guard fails > freeTries else { return nil }
        let doublings = min(fails - freeTries - 1, 12)
        return min(firstLockMs << doublings, maxLockMs)
    }

    /// What is left of a lock-out, from two clocks. The wall clock survives a restart of the
    /// phone but can be moved by hand; the monotonic clock (`elapsedAtLock` was its reading when
    /// the lock started) cannot, but starts again at a restart (then `elapsedNow < elapsedAtLock`
    /// and only the wall clock counts). The longer remaining time wins.
    public static func remainingLockMs(wallUntil: Int64, wallNow: Int64, lockedForMs: Int64,
                                       elapsedAtLock: Int64, elapsedNow: Int64) -> Int64 {
        let wall = max(wallUntil - wallNow, 0)
        let since = elapsedNow - elapsedAtLock
        let monotonic = (elapsedAtLock >= 0 && since >= 0) ? max(lockedForMs - since, 0) : 0
        return max(wall, monotonic)
    }
}
