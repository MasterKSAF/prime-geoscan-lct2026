---
title: "Offline Copies — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-offline.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "1536569b3996433985612b0f0eec099a04205e59dc4d9a5592b2d326a1a76624"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Offline Copies — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-offline.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="offline-copies"></a>

<a id="common-offline"></a>

# Offline Copies

We have implemented a way to easily save offline copies of the ArduPilot wiki so that key documentation can still be accessed when there is no internet connection available. You can select which parts of the wiki you would like to save and never be left scratching your head trying to remember how to configure a vehicle or plan a mission.

Having the ability to access the trove of information from the wiki at the field improves the ability to troubleshoot issues and gives you the confidence to fly safely.

There are three ways you can go about making offline copies:

1. You can download all, or parts, of the wiki **into the browser**, which will be cached and available to use with no internet connection. (But if you run out of storage the browser can delete it without warning you.)
2. You can **install the wiki as an app**, like a normal app such as Google Chrome. This also makes it less likely that the browser will remove the saved wikis without warning.
3. You can save all, or parts, of the wiki **as a .html file**, which you can save to a USB stick and copy to another device.

No account is needed. The browser downloads the selected documentation from the site and stores it on this device; it does not upload your documentation or create a file in your Downloads folder unless you download the HTML.

To learn more about how any of this works, what it needs to run, and how to test it, see [How Offline Copies Work](https://ardupilot.org/dev/docs/wiki-offline-copies.html) in the developer documentation.

<a id="implementing-offline-copies"></a>

## Implementing Offline Copies

Select the parts of the wiki that you wish to access offline in the table below and click **Save selected wikis**. You will find that if you turn off your internet connection, you will still be able to access the parts of the wiki that you have selected.

Click **Check for updates** periodically to ensure that you have the most up to date version of the parts of the wiki that you have saved. You can select **Remove all** to clear the cache if you no longer need access to the saved wiki.

You can turn on **Offline mode**, which runs a service worker in the browser so the pages you have read, and the wikis you save, open with no connection. Turning it off removes everything saved in the browser.

This tool needs JavaScript. Reading the wiki does not: every page works as it always has.

<a id="storage-warning"></a>

<a id="quota-warning"></a>

**Offline mode:

<a id="offline-mode-state"></a>

off**

Runs a service worker in this browser so the pages you have read, and the wikis you save, open with no connection. Saving a wiki turns it on. Turning it off removes everything saved in this browser.

<a id="offline-off-warning"></a>

Turning offline mode off removes everything this site has saved in this browser (

<a id="offline-off-size"></a>

). Files you saved to disk with Save as .html are not affected.

Save for Offline Use

| Wiki <br><br>all params | Size | Pages | Progress | Status |
| --- | --- | --- | --- | --- |

Update saved pages automatically

<a id="selection-total"></a>

<a id="cache-progress"></a>

<a id="check-result"></a>

<a id="storage-status"></a>

<a id="build-date"></a>

Install as an app

<a id="install-state"></a>

If your device is running low on storage, your browser may unexpectedly clear the cached data, such as your offline wiki. Installing as an app makes that less likely, and gives the wiki its own window and a launcher icon. It downloads nothing by itself.

Save as a static HTML page

Built on this device from the wikis ticked above. Anything not saved yet is downloaded first, which turns offline mode on just as Save does, so one press is enough. Each file contains exactly the wikis you chose, shared images included.

A single self-contained page. Double-click it, nothing to install. Search works across the full text of every page. It runs from a USB stick, though it is large and takes a moment to open.

<a id="what-to-expect"></a>

## What to Expect

**Saving a wiki lets you read every page in it without a connection.** Pages come from your own device rather than the network, so they open quickly in a hangar, on a plane, or anywhere with no signal.

It costs storage. Roughly:

| Shared images (required) | about 440 MB |
| --- | --- |
| A vehicle wiki on top of that | 4 to 75 MB |
| All ten wikis | about 700 MB |

The shared images are needed whichever wiki you choose, because nearly every page uses them, so the first save is the large one. Saving a second wiki afterwards costs only its own pages.

**It is faster, too.** Roughly:

| A page you have read | opens in a blink instead of a second |
| --- | --- |
| The huge parameter lists | about three times faster to appear |

<a id="how-it-works"></a>

## How It Works

The wiki is stored by your browser and served from your own device. No account is involved, and the pages you read offline are the same files the site serves normally. While automatic updates are enabled, the wiki may check this site for changed pages while it is open.

Offline mode is off until you turn it on with the switch at the top of this page; saving a wiki turns it on too. Off, the site behaves exactly as it always has and nothing runs in the background. Turning it off removes the saved wikis and every cached page from this browser and returns the site to how it was; you are asked first, and told how much will go. Files you saved with **Save as .html** are not affected.

<a id="things-to-consider"></a>

## Things to Consider

- **The browser can evict saved wikis** if the device runs very low on storage, without warning you first. Installing as an app helps, and the storage line under the table says whether this browser has granted persistent storage.
- **Clearing this site’s data removes everything saved here**, as does clearing browsing data in most browsers. Offline mode turns off with it.
- **Private and incognito windows keep nothing** once the last one closes.
- **A saved wiki is a snapshot.** Leave automatic updates on, or press Check for updates now and then, so your copy follows the site.
