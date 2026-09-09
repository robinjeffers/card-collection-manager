import Link from "next/link"
import { FileQuestion } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FileQuestion className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Page not found</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Link href="/" className={buttonVariants()}>
        Back to your collections
      </Link>
    </main>
  )
}
