---
"@hussmartinez/sdk-core": patch
---

`{size, fileSize}` now writes sizes under a kilobyte with the locale's plural, such as "1 byte" and "297 bytes" in English, "297 octets" in French and "297 bajtów" in Polish, instead of "297 byte". Kilobytes and larger units are unchanged, such as "1.3 MB". A size that would round to 1000 of a unit moves up to the next one, so 999,960 bytes is "1 MB" rather than "1,000 kB".
