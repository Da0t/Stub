import Link from "next/link";

export default function Home() {
  return <main style={{ padding: 40, fontFamily: "system-ui" }}><h1>Wrapped for the Weekend</h1><p><Link href="/wrapped">Open the Wrapped</Link></p><p><Link href="/artist">Open the artist desk</Link></p></main>;
}
