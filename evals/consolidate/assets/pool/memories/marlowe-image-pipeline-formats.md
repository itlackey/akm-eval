---
description: What the Marlowe image pipeline does to an upload.
tags: [images, pipeline]
---

# Marlowe image pipeline

Uploads to Marlowe are limited to 20 MB. The pipeline strips metadata from every image. Images wider than 2400 pixels are scaled down to 2400. Each image is stored as WebP at quality 82. The original is kept for 30 days in the bucket marlowe-originals. Thumbnails of 160 and 480 pixels are made on the first request. Animated GIFs are converted to MP4 and not to WebP.
