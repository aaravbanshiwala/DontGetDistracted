# Don't Get Distracted

A minimal Chrome extension that helps you stay focused by alerting you when you're spending too much consecutive time on distracting sites like YouTube Shorts, TikTok, and Instagram.

**Author:** Aarav

## Features

- Tracks consecutive visits to distracting sites
- Customizable alert threshold (default: 10 visits)
- Custom alert message
- Add/remove tracked sites with wildcard patterns
- Dark mode support
- Real-time counter in popup
- Clean, Notion-style UI

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `dont-get-distracted` folder
6. The extension icon will appear in your toolbar

## Usage

- Click the extension icon to see your current distraction count
- Click **Open Settings** to customize:
  - **Threshold**: Number of consecutive visits before alert triggers
  - **Alert message**: Custom message shown when you get distracted
  - **Tracked sites**: Add or remove sites using wildcard patterns (e.g., `youtube.com/shorts/*`)
  - **Dark mode**: Toggle dark theme

## Default Tracked Sites

- `youtube.com/shorts/*`
- `tiktok.com/*`
- `instagram.com/*`

## How It Works

The extension monitors your browsing. When you visit tracked sites consecutively (e.g., scrolling through YouTube Shorts), a counter increments. Once you hit the threshold, a full-page alert reminds you to get back to work. Visiting any non-tracked site resets the counter.

## LICENSE
```
© 2026 Aarav. All Rights Reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, modification, public display, or public performance of this software is strictly prohibited.

Terms:

1. No Redistribution: You may not share, distribute, sublicense, sell, or provide access to this software to any third party without explicit written permission from the author.

2. Personal Use Only: This license grants you the right to use this software for personal purposes only. Commercial use requires a separate license agreement.

3. No Modification for Distribution: You may not modify this software and distribute the modified version.

4. Revocation: The author reserves the right to revoke access at any time for violation of these terms.

5. No Warranty: This software is provided "as is" without warranty of any kind.

By using this software, you agree to these terms. Violation of this license may result in termination of access and legal action.

For licensing inquiries, contact the author.
```