import AppKit
import Carbon
import Foundation

struct Shortcut {
  let keyCode: UInt32
  let modifiers: UInt32
}

enum HelperError: Error, CustomStringConvertible {
  case missingShortcut
  case unsupportedShortcut(String)
  case installHandlerFailed(OSStatus)
  case registerHotKeyFailed(OSStatus)

  var description: String {
    switch self {
    case .missingShortcut:
      return "Missing required --shortcut argument."
    case .unsupportedShortcut(let value):
      return "Unsupported hotkey: \(value)"
    case .installHandlerFailed(let status):
      return "Unable to install Carbon hotkey handler (\(status))."
    case .registerHotKeyFailed(let status):
      return "Unable to register Carbon hotkey (\(status))."
    }
  }
}

func normalizeShortcut(_ shortcut: String) -> (modifiers: Set<String>, mainKey: String) {
  let tokens = shortcut
    .split(separator: "+")
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
  let modifiers = Set(tokens.map { $0.lowercased() })
  let mainKey = tokens.last?.lowercased() ?? ""
  return (modifiers, mainKey)
}

func resolveKeyCode(_ key: String) -> UInt32? {
  let normalized = key.replacingOccurrences(of: " ", with: "").uppercased()
  let keyMap: [String: UInt32] = [
    "A": UInt32(kVK_ANSI_A),
    "B": UInt32(kVK_ANSI_B),
    "C": UInt32(kVK_ANSI_C),
    "D": UInt32(kVK_ANSI_D),
    "E": UInt32(kVK_ANSI_E),
    "F": UInt32(kVK_ANSI_F),
    "G": UInt32(kVK_ANSI_G),
    "H": UInt32(kVK_ANSI_H),
    "I": UInt32(kVK_ANSI_I),
    "J": UInt32(kVK_ANSI_J),
    "K": UInt32(kVK_ANSI_K),
    "L": UInt32(kVK_ANSI_L),
    "M": UInt32(kVK_ANSI_M),
    "N": UInt32(kVK_ANSI_N),
    "O": UInt32(kVK_ANSI_O),
    "P": UInt32(kVK_ANSI_P),
    "Q": UInt32(kVK_ANSI_Q),
    "R": UInt32(kVK_ANSI_R),
    "S": UInt32(kVK_ANSI_S),
    "T": UInt32(kVK_ANSI_T),
    "U": UInt32(kVK_ANSI_U),
    "V": UInt32(kVK_ANSI_V),
    "W": UInt32(kVK_ANSI_W),
    "X": UInt32(kVK_ANSI_X),
    "Y": UInt32(kVK_ANSI_Y),
    "Z": UInt32(kVK_ANSI_Z),
    "0": UInt32(kVK_ANSI_0),
    "1": UInt32(kVK_ANSI_1),
    "2": UInt32(kVK_ANSI_2),
    "3": UInt32(kVK_ANSI_3),
    "4": UInt32(kVK_ANSI_4),
    "5": UInt32(kVK_ANSI_5),
    "6": UInt32(kVK_ANSI_6),
    "7": UInt32(kVK_ANSI_7),
    "8": UInt32(kVK_ANSI_8),
    "9": UInt32(kVK_ANSI_9),
    "F1": UInt32(kVK_F1),
    "F2": UInt32(kVK_F2),
    "F3": UInt32(kVK_F3),
    "F4": UInt32(kVK_F4),
    "F5": UInt32(kVK_F5),
    "F6": UInt32(kVK_F6),
    "F7": UInt32(kVK_F7),
    "F8": UInt32(kVK_F8),
    "F9": UInt32(kVK_F9),
    "F10": UInt32(kVK_F10),
    "F11": UInt32(kVK_F11),
    "F12": UInt32(kVK_F12),
    "F13": UInt32(kVK_F13),
    "F14": UInt32(kVK_F14),
    "F15": UInt32(kVK_F15),
    "F16": UInt32(kVK_F16),
    "F17": UInt32(kVK_F17),
    "F18": UInt32(kVK_F18),
    "F19": UInt32(kVK_F19),
    "F20": UInt32(kVK_F20),
    "ESC": UInt32(kVK_Escape),
    "ESCAPE": UInt32(kVK_Escape),
    "RETURN": UInt32(kVK_Return),
    "ENTER": UInt32(kVK_Return),
    "SPACE": UInt32(kVK_Space),
    "TAB": UInt32(kVK_Tab),
    "BACKSPACE": UInt32(kVK_Delete),
    "DELETE": UInt32(kVK_Delete),
    "DEL": UInt32(kVK_Delete),
    "FORWARDDELETE": UInt32(kVK_ForwardDelete),
    "UP": UInt32(kVK_UpArrow),
    "DOWN": UInt32(kVK_DownArrow),
    "LEFT": UInt32(kVK_LeftArrow),
    "RIGHT": UInt32(kVK_RightArrow),
    "HOME": UInt32(kVK_Home),
    "END": UInt32(kVK_End),
    "PAGEUP": UInt32(kVK_PageUp),
    "PAGEDOWN": UInt32(kVK_PageDown),
  ]
  return keyMap[normalized]
}

func resolveModifiers(_ modifiers: Set<String>) -> UInt32 {
  var flags: UInt32 = 0
  if modifiers.contains("shift") {
    flags |= UInt32(shiftKey)
  }
  if modifiers.contains("ctrl") || modifiers.contains("control") {
    flags |= UInt32(controlKey)
  }
  if modifiers.contains("alt") || modifiers.contains("option") {
    flags |= UInt32(optionKey)
  }
  if modifiers.contains("cmd") || modifiers.contains("command") || modifiers.contains("meta") {
    flags |= UInt32(cmdKey)
  }
  return flags
}

func parseShortcut(_ shortcut: String) throws -> Shortcut {
  let normalized = normalizeShortcut(shortcut)
  guard !normalized.mainKey.isEmpty else {
    throw HelperError.missingShortcut
  }
  guard let keyCode = resolveKeyCode(normalized.mainKey) else {
    throw HelperError.unsupportedShortcut(shortcut)
  }
  return Shortcut(keyCode: keyCode, modifiers: resolveModifiers(normalized.modifiers))
}

func emit(_ payload: String) {
  FileHandle.standardOutput.write(Data((payload + "\n").utf8))
}

func fail(_ error: Error) -> Never {
  emit("{\"type\":\"error\",\"message\":\(String(describing: error).debugDescription)}")
  Foundation.exit(1)
}

func parseArguments() throws -> String {
  var iterator = CommandLine.arguments.dropFirst().makeIterator()
  while let argument = iterator.next() {
    if argument == "--shortcut", let value = iterator.next() {
      return value
    }
  }
  throw HelperError.missingShortcut
}

final class HotkeyAppDelegate: NSObject, NSApplicationDelegate {
  private let shortcut: Shortcut
  private var hotKeyRef: EventHotKeyRef?
  private var eventHandlerRef: EventHandlerRef?
  private var pressed = false

  init(shortcut: Shortcut) {
    self.shortcut = shortcut
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      try registerHotkey()
      emit("{\"type\":\"ready\"}")
    } catch {
      fail(error)
    }
  }

  private func registerHotkey() throws {
    var eventTypes = [
      EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
      EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased)),
    ]
    let handler: EventHandlerUPP = { _, eventRef, userData in
      guard let eventRef, let userData else { return noErr }
      let delegate = Unmanaged<HotkeyAppDelegate>.fromOpaque(userData).takeUnretainedValue()
      let kind = GetEventKind(eventRef)
      if kind == UInt32(kEventHotKeyPressed) {
        if !delegate.pressed {
          delegate.pressed = true
          emit("{\"type\":\"state\",\"active\":true}")
        }
      } else if kind == UInt32(kEventHotKeyReleased) {
        if delegate.pressed {
          delegate.pressed = false
          emit("{\"type\":\"state\",\"active\":false}")
        }
      }
      return noErr
    }
    let installStatus = InstallEventHandler(
      GetApplicationEventTarget(),
      handler,
      eventTypes.count,
      &eventTypes,
      Unmanaged.passUnretained(self).toOpaque(),
      &eventHandlerRef
    )
    guard installStatus == noErr else {
      throw HelperError.installHandlerFailed(installStatus)
    }
    let hotKeyID = EventHotKeyID(signature: OSType(0x5658434E), id: 1)
    let registerStatus = RegisterEventHotKey(
      shortcut.keyCode,
      shortcut.modifiers,
      hotKeyID,
      GetApplicationEventTarget(),
      0,
      &hotKeyRef
    )
    guard registerStatus == noErr else {
      throw HelperError.registerHotKeyFailed(registerStatus)
    }
  }
}

do {
  let shortcut = try parseArguments()
  let resolved = try parseShortcut(shortcut)
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let delegate = HotkeyAppDelegate(shortcut: resolved)
  app.delegate = delegate
  app.run()
} catch {
  fail(error)
}
