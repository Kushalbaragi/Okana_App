import SwiftUI
import WidgetKit

// The widgets' look — the same dark palette as the app (tailwind.config.js) and
// the same designs as the Android ones in widgets/android/OkanaWidgets.js.

enum Theme {
  static let background = Color(red: 0.086, green: 0.086, blue: 0.086) // #161616
  static let track = Color(red: 0.165, green: 0.165, blue: 0.165)      // #2a2a2a
  static let bar = Color(red: 0.29, green: 0.29, blue: 0.29)           // #4a4a4a
  static let muted = Color(red: 0.541, green: 0.541, blue: 0.541)      // #8a8a8a
  static let green = Color(red: 0.29, green: 0.871, blue: 0.502)       // #4ade80
  static let red = Color(red: 0.973, green: 0.443, blue: 0.443)        // #f87171
  static let soft = Color(red: 0.898, green: 0.898, blue: 0.898)       // #e5e5e5
}

private func number(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
  .system(size: size, weight: weight, design: .rounded)
}

struct ProgressBar: View {
  let percent: Double
  let color: Color
  var height: CGFloat = 6

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        Capsule().fill(Theme.track)
        Capsule()
          .fill(color)
          .frame(width: max(percent > 0 ? height : 0, proxy.size.width * min(1, max(0, percent / 100))))
      }
    }
    .frame(height: height)
  }
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

// Small: this month's spend against the budget.
struct MonthSpendView: View {
  let entry: OkanaEntry

  var body: some View {
    if let data = entry.data {
      let percent = data.budget.map { $0 > 0 ? data.spent / $0 * 100 : 0 } ?? 0
      VStack(alignment: .leading, spacing: 0) {
        Text("Spent in \(data.monthLabel)").font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
        Spacer(minLength: 4)
        Text(money(data.spent)).font(number(26)).foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
        Text(data.budget.map { "of \(money($0))" } ?? "No budget set")
          .font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
        Spacer(minLength: 8)
        if data.budget != nil {
          ProgressBar(percent: percent, color: percent >= 100 ? Theme.red : Theme.soft)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    } else {
      SignedOutView()
    }
  }
}

// Small: the goal closest to done.
struct GoalView: View {
  let entry: OkanaEntry

  var body: some View {
    if let data = entry.data {
      if let goal = data.goals.first {
        VStack(alignment: .leading, spacing: 0) {
          Text(goal.name).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
          Spacer(minLength: 4)
          Text("\(goal.percent)%").font(number(26)).foregroundStyle(.white)
          Text("\(money(goal.saved)) of \(money(goal.target))")
            .font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.8)
          Spacer(minLength: 8)
          ProgressBar(percent: Double(goal.percent), color: Theme.green)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      } else {
        VStack(alignment: .leading, spacing: 2) {
          Text("Savings").font(.system(size: 11)).foregroundStyle(Theme.muted)
          Spacer()
          Text("No goals yet").font(number(16)).foregroundStyle(.white)
          Text("Add one in Okana").font(.system(size: 11)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      }
    } else {
      SignedOutView()
    }
  }
}

// Medium: spend per day over the last 30 days, today in red.
struct DailyChartView: View {
  let entry: OkanaEntry

  var body: some View {
    if let data = entry.data {
      let total = data.daysTotal
      let peak = max(data.days.max() ?? 0, 1)
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 0) {
            Text("Last 30 days").font(.system(size: 11)).foregroundStyle(Theme.muted)
            Text(money(total)).font(number(22)).foregroundStyle(.white)
          }
          Spacer()
          Text("\(money(total / Double(widgetDays))) / day").font(.system(size: 11)).foregroundStyle(Theme.muted)
        }
        GeometryReader { proxy in
          HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(data.days.enumerated()), id: \.offset) { index, amount in
              RoundedRectangle(cornerRadius: 2)
                .fill(index == data.days.count - 1 ? Theme.red : (amount > 0 ? Theme.bar : Theme.track))
                .frame(height: amount > 0 ? max(3, proxy.size.height * amount / peak) : 2)
                .frame(maxWidth: .infinity)
            }
          }
          .frame(maxHeight: .infinity, alignment: .bottom)
        }
      }
    } else {
      SignedOutView()
    }
  }
}

// Medium and large: every active goal that fits, closest to done first.
struct GoalsView: View {
  let entry: OkanaEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if let data = entry.data {
      let fit = family == .systemLarge ? 6 : 3
      let shown = Array(data.goals.prefix(fit))
      VStack(alignment: .leading, spacing: 0) {
        HStack {
          Text("Savings goals").font(.system(size: 11)).foregroundStyle(Theme.muted)
          Spacer()
          if !data.goals.isEmpty {
            Text(data.goals.count > shown.count ? "+\(data.goals.count - shown.count) more" : "\(data.goals.count) active")
              .font(.system(size: 11)).foregroundStyle(Theme.muted)
          }
        }
        if shown.isEmpty {
          Spacer()
          Text("No goals yet").font(number(16)).foregroundStyle(.white)
          Text("Add one in Okana").font(.system(size: 11)).foregroundStyle(Theme.muted)
          Spacer()
        } else {
          Spacer(minLength: 6)
          VStack(spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, goal in
              VStack(spacing: 4) {
                HStack {
                  Text(goal.name).font(.system(size: 13)).foregroundStyle(.white).lineLimit(1)
                  Spacer(minLength: 8)
                  Text("\(money(goal.saved)) · \(goal.percent)%").font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(1)
                }
                ProgressBar(percent: Double(goal.percent), color: Theme.green, height: 5)
              }
              .frame(maxHeight: .infinity)
            }
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      SignedOutView()
    }
  }
}
