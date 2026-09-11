import { readFile, stat } from "fs/promises"
import path from "path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { derivedSuffix, generateDerived } from "@/lib/image-derive"
import { EXTENSION_MIME, TEMPLATE_EXTENSION_MIME, UPLOAD_DIR } from "@/lib/uploads"

// Temporary instrumentation: log any image request whose server-side handling
// crosses this threshold, with a breakdown of where the time went (auth / stat
// / read or on-demand generate). This isolates whether the intermittent blank
// thumbnails come from server latency or from client/proxy-level queuing.
const SLOW_REQUEST_MS = 300

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const t0 = performance.now()
  const timings: Record<string, number> = {}

  const session = await auth.api.getSession({ headers: await headers() })
  timings.auth = Math.round(performance.now() - t0)
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const segments = (await params).path ?? []

  // Collections (and their artwork/templates) are shared, so any signed-in user
  // may read any uploaded file. The first path segment is just the uploader's
  // user id namespace; we no longer restrict reads to the caller's own namespace.

  // Resolve the target and confirm it stays inside UPLOAD_DIR (block `..`).
  const root = path.resolve(UPLOAD_DIR)
  const resolved = path.resolve(root, ...segments)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return new NextResponse("Bad request", { status: 400 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const imageType = EXTENSION_MIME[ext]
  const templateType = TEMPLATE_EXTENSION_MIME[ext]
  if (!imageType && !templateType) {
    return new NextResponse("Unsupported", { status: 415 })
  }

  const isDerived = Boolean(imageType && derivedSuffix(path.basename(resolved)))
  // Derived thumbnails/previews are tiny and content-stable, so cache them hard
  // with stale-while-revalidate: repeat views are instant, and a re-optimize
  // (new mtime -> new ETag) is picked up on the next background revalidation.
  // Originals get a shorter window since they're only ever the download target.
  const cacheControl = isDerived
    ? "private, max-age=86400, stale-while-revalidate=2592000"
    : "private, max-age=3600, stale-while-revalidate=86400"

  const logSlow = (outcome: string) => {
    const total = Math.round(performance.now() - t0)
    if (total >= SLOW_REQUEST_MS) {
      const parts = Object.entries(timings)
        .map(([k, v]) => `${k}=${v}ms`)
        .join(" ")
      console.log(
        `[v0] slow upload ${outcome} total=${total}ms ${parts} derived=${isDerived} file=${path.basename(resolved)}`,
      )
    }
  }

  try {
    // ETag from size+mtime lets the browser revalidate with a cheap 304 instead
    // of resending the bytes, which keeps scrolling back through the grid snappy.
    const statStart = performance.now()
    const st = await stat(resolved)
    timings.stat = Math.round(performance.now() - statStart)
    const etag = `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`
    if (request.headers.get("if-none-match") === etag) {
      logSlow("304")
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } })
    }

    const readStart = performance.now()
    const data = await readFile(resolved)
    timings.read = Math.round(performance.now() - readStart)
    logSlow("hit")
    const responseHeaders: Record<string, string> = {
      "Content-Type": imageType ?? templateType,
      "Cache-Control": cacheControl,
      ETag: etag,
    }
    // Template/source files are always sent as a download, never rendered
    // inline (this also neutralizes any SVG script content).
    if (!imageType && templateType) {
      const base = path.basename(resolved)
      responseHeaders["Content-Disposition"] = `attachment; filename="${base.replace(/"/g, "")}"`
    }
    return new NextResponse(new Uint8Array(data), { headers: responseHeaders })
  } catch {
    // Not on disk. If this is a derived image (`.preview.webp`/`.thumb.webp`),
    // generate it from the original on demand, cache it, and serve it. This is
    // what optimizes pre-existing artwork the first time it's viewed, with no
    // client-side work.
    if (imageType && derivedSuffix(path.basename(resolved))) {
      const genStart = performance.now()
      const generated = await generateDerived(resolved)
      timings.generate = Math.round(performance.now() - genStart)
      if (generated) {
        logSlow("generated")
        return new NextResponse(new Uint8Array(generated), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": cacheControl,
          },
        })
      }
    }
    logSlow("404")
    return new NextResponse("Not found", { status: 404 })
  }
}
