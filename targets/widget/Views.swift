import SwiftUI
import WidgetKit

// The widgets' look — the same dark palette as the app (tailwind.config.js) and
// the same designs as the Android ones in widgets/android/OkanaWidgets.js.

enum Theme {
  static let background = Color.black
  static let track = Color(red: 0.165, green: 0.165, blue: 0.165)      // #2a2a2a
  static let muted = Color(red: 0.541, green: 0.541, blue: 0.541)      // #8a8a8a
  static let green = Color(red: 0.29, green: 0.871, blue: 0.502)       // #4ade80
  static let red = Color(red: 0.973, green: 0.443, blue: 0.443)        // #f87171
}

private func number(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
  .system(size: size, weight: weight, design: .rounded)
}

private struct SignedOutView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Okana").font(.system(size: 11)).foregroundStyle(Theme.muted)
      Spacer()
      Text("Open Okana to see your numbers here").font(.system(size: 14)).foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

// Medium: this month's total, how it compares with all of last month, and a
// candle for every day so far. Heights follow a square root, like the app's own
// month chart, with a floor, so a small day still shows next to a big one.
struct DailyChartView: View {
  let entry: OkanaEntry
  private let labelOpacity = 0.75

  var body: some View {
    if let data = entry.data {
      let peak = max(data.month.max() ?? 0, 1)
      VStack(spacing: 0) {
        // "This month", the total and the change, centred one below the other, the
        // labels small and dimmed so the total stands out and the candles get the height.
        VStack(spacing: 3) {
          Text("This month").font(.system(size: 9)).foregroundStyle(Theme.muted).opacity(labelOpacity)
          Text(money(data.spent)).font(number(18)).foregroundStyle(.white).lineLimit(1)
          if let change = monthChange(data) {
            Text("\(change > 0 ? "↑" : "↓") \(abs(change))%")
              .font(.system(size: 9, weight: .medium))
              .foregroundStyle(change > 0 ? Theme.red : Theme.green)
              .opacity(labelOpacity)
          }
        }
        .frame(maxWidth: .infinity)
        GeometryReader { proxy in
          HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(data.month.enumerated()), id: \.offset) { index, amount in
              Group {
                if index < data.today && amount > 0 {
                  RoundedRectangle(cornerRadius: 2)
                    .fill(Theme.red)
                    .frame(height: proxy.size.height * max(0.12, (amount / peak).squareRoot()))
                } else {
                  Circle()
                    .fill(index < data.today ? Theme.green : Theme.track)
                    .frame(width: index < data.today ? 5 : 4, height: index < data.today ? 5 : 4)
                }
              }
              .frame(maxWidth: .infinity)
            }
          }
          .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .padding(.top, 8)
      }
    } else {
      SignedOutView()
    }
  }

  // This month against all of last month, in whole percent; nil (no label) with no
  // spend last month to compare against, or no difference.
  private func monthChange(_ data: WidgetData) -> Int? {
    guard let last = data.lastMonthSpent, last > 0 else { return nil }
    let change = Int(((data.spent - last) / last * 100).rounded())
    return change == 0 ? nil : change
  }
}
