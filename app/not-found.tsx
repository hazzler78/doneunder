import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <Link href="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
