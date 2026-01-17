# UX Guidelines for Lumen Bot

This document outlines the tone, terminology, and messaging principles for all user-facing content in the Lumen Telegram bot.

## Tone Principles

### Core Values
- **Calm**: Never urgent, alarming, or pressuring
- **Supportive**: Helpful guidance without being chatty
- **Clear**: Concrete language over vague phrases
- **Professional**: Neutral-friendly, not robotic or playful

### What to Avoid
- Robotic or system-centric phrasing ("Error occurred", "Failed to process")
- Playful or sarcastic language
- Unnecessary exclamation marks
- Self-referential commentary ("I am processing...")
- Repetitive information

## Terminology Standards

### Required Terms
- **"class"** consistently (never "lecture" or "session" interchangeably)
- **"marked present"** / **"marked absent"** (not "logged", "recorded", "checked in")
- **"attendance"** only in subject-wise context (course attendance)
- **"schedule"** for daily/weekly view

### Forbidden Terms
- Internal/technical terms in user messages
- System-centric phrasing ("System error", "Database unavailable")
- Ambiguous plurals without counts

## Personalization Rules

### Name Usage - When to Use
Use resolved user name (`getUserGreeting()`) at:
- Start of `/start` command (returning users)
- Header of `/status` command
- Greeting line of daily brief

### Name Usage - When NOT to Use
- Error messages
- Inline button labels
- Repeated usage within same message
- Confirmations after actions
- Settings toggle messages

### Examples
✅ Good: "Welcome back, Shashank."  
❌ Bad: "Welcome back, Shashank! Your account is ready, Shashank."

✅ Good: "Your Attendance, Shashank"  
❌ Bad: "Shashank's Attendance Status"

## Emoji Standards

### Functional Emojis Only
Use these sparingly for scannability:
- ⏰ Time/schedule
- 📚 Classes/education (removed from most contexts)
- ✅ Success markers (removed from most confirmations)
- 📍 Location/venue
- 🧪 Lab designation

### Removed Emojis
- ❌ Error markers (use clear text instead)
- 💡 Help indicators
- 📊 Stats indicators
- 🔔/🔕 Settings toggles
- 🌅 Greeting decorations
- 💪 Motivational extras

### Rule
Max one emoji per message section. Prefer clarity over decoration.

## Message Structure

### Confirmation Messages
Pattern:
```
[Action summary]
[Optional: affected items if >1]

_Use /undo to revert if needed._
```

Examples:
- "Marked 3 classes present (1 already marked).\n\n_Use /undo to revert if needed._"
- "Marked absent.\n\n[Course name]\n\n_Use /undo to revert if needed._"

### Error Messages
Pattern:
```
[Clear statement of what didn't work]
[Actionable next step if available]
```

Examples:
- "Something didn't go through. Try again in a moment."
- "I couldn't find those class numbers. Use /today to see your schedule."
- "You need to connect your account first. Use /start."

### Empty States
Pattern:
```
No [items] [time qualifier].
```

Examples:
- "No classes scheduled for today."
- "No classes scheduled for tomorrow."
- "No courses found."

### Schedule Display
Pattern:
```
*[Day]'s Schedule ([Date])*

[Index]. *[Course Name]* [Status]
   ⏰ [Start] - [End]
   📍 [Venue]
```

Status markers:
- ✅ Marked present
- ⏸️ Not marked yet

### Status Display
Pattern:
```
*Your Attendance, [Name]*

[Course Name] [Lab Tag]
  [attended] / [total] ([percentage]%)

_Updated in real-time as you mark attendance._
```

## Daily Brief Format

```
Good morning, [Name].

Today's classes:
- [Course] @ [Time] • [Venue]
- [Course] @ [Time]

Your attendance:
[Course]: [attended]/[total] ([percentage]%)
[Course]: [attended]/[total] ([percentage]%)

Keep it up.

_Updates in real-time as you mark attendance._
```

### If No Classes
```
Good morning, [Name].

No classes today.

Your attendance:
[Course]: [attended]/[total] ([percentage]%)

Keep it up.

_Updates in real-time as you mark attendance._
```

## Reminder Format

```
*Class Reminder*

[Course Name] starts at [Time].
📍 [Venue]
```

## Inline Keyboard Messages

### Selection Prompts
- Present: "*Select classes to mark present:*\nTap to select, then confirm. Or: /attend 1 2"
- Absent: "*Select classes to mark absent:*\nTap to select, then confirm. Or: /absent 1 2"

### Pre-selection (Smart Default)
```
*Current/Upcoming Class Pre-selected*

[Course Name] is starting soon.

Tap to adjust selection, then confirm.
```

### Callback Confirmations
- "Marked present for [Course Name]"
- "Marked absent for [Course Name]"
- "Already marked present for [Course Name]"

### Callback Errors
- "This action has expired."
- "Please use /start to link your account."
- "Something didn't go through. Try again in a moment."

## Help Documentation

### Command Descriptions
Keep descriptions action-oriented and concise:
- ✅ "Mark present (tap classes or type numbers)"
- ❌ "Mark yourself as present for classes (you can use buttons or type numbers)"

### Examples Section
Always include concrete examples:
```
*Examples:*
/attend → Shows buttons for all classes
/attend 1 3 5 → Mark classes 1, 3, and 5 present
```

## Settings Messages

### Toggle Confirmations
Pattern: "[Feature] [enabled/disabled]. [What happens]"

Examples:
- "Class reminders enabled. You'll be notified 10 minutes before each class."
- "Class reminders disabled."
- "Daily brief enabled. You'll receive a morning summary at 8:00 AM."
- "Daily brief disabled."

## Reset Flow

### Confirmation Prompt
```
*Account Disconnect*

This will remove the link between your Telegram and Attendrix.

*What happens:*
• Your Telegram link is removed
• You'll need to run /start to reconnect

*What's preserved:*
• All your attendance records
• Your Attendrix account
• Your course enrollments

Are you sure?
```

### Success
```
*Account Disconnected*

Your Telegram is no longer linked to Attendrix.

To reconnect, use /start.
```

### Cancel
```
Disconnect cancelled.
```

## Undo Messages

### Success
```
Undid [attendance/absence] for [N] class[es].
```

### No Actions
```
Nothing to undo. All actions are from previous days.
```

### Time Restriction
```
Can only undo today's actions. Last action was on [date].
```

## Version Control

This document reflects UX standards as of Step 10.3.
All user-facing messages should align with these guidelines.

**Last Updated**: January 17, 2026
**Maintained by**: Development team
