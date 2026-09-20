import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-bold text-espresso-300">404</p>
      <h1 className="mt-2 text-xl font-bold">Not found</h1>
      <p className="mt-1 text-espresso-500">This order or page doesn’t exist. It may have been deleted.</p>
      <Link href="/" className={`${btn.primary} mt-6`}>
        Back to new order
      </Link>
    </div>
  );
}
