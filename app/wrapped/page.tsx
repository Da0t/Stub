import { LastCard, OpeningCard, StatCard, StripReveal, SwipeDeck } from "@/components/wrapped";
import "./wrapped.css";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const openingCard = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#152f38"/><stop offset=".58" stop-color="#b9b087"/><stop offset="1" stop-color="#d45c35"/></linearGradient><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="2" seed="8"/><feBlend mode="soft-light" in="SourceGraphic"/></filter></defs>
<rect width="1000" height="1400" fill="url(#sky)"/><circle cx="760" cy="330" r="150" fill="#f1d083" opacity=".72"/><path d="M0 930 Q240 700 450 900 T1000 810 V1400 H0Z" fill="#183e37"/><path d="M0 1040 Q220 870 430 1010 T1000 950 V1400 H0Z" fill="#102924"/><g fill="#e9d7a8" opacity=".8"><circle cx="130" cy="790" r="13"/><circle cx="180" cy="770" r="9"/><circle cx="245" cy="810" r="12"/><circle cx="705" cy="735" r="14"/><circle cx="770" cy="750" r="9"/></g><rect x="26" y="26" width="948" height="1348" rx="24" fill="none" stroke="#f2d393" stroke-width="14"/><text x="70" y="110" fill="#f7e7bd" font-family="Georgia" font-size="30" letter-spacing="8">OUTSIDE LANDS · 2026</text><text x="70" y="1260" fill="#f7e7bd" font-family="Georgia" font-size="76">THUNDERCAT</text><text x="70" y="1320" fill="#f7e7bd" font-family="Arial" font-size="28" letter-spacing="4">SUTRO · SUNDAY</text></svg>`);

const strip = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#122b27"/><text x="75" y="130" fill="#f3d990" font-family="Georgia" font-size="64">YOUR WEEKEND</text><text x="78" y="182" fill="#c7d2b0" font-family="Arial" font-size="20" letter-spacing="7">OUTSIDE LANDS · 2026</text>${Array.from({ length: 12 }, (_, i) => { const x = 75 + (i % 3) * 315; const y = 250 + Math.floor(i / 3) * 380; const colors = ["#d9653b", "#dfbd71", "#587b6b", "#7d5256"]; return `<rect x="${x}" y="${y}" width="270" height="340" rx="8" fill="${colors[i % 4]}"/><text x="${x + 22}" y="${y + 300}" fill="#fff5d5" font-family="Georgia" font-size="25">SET ${i + 1}</text>`; }).join("")}<text x="75" y="1815" fill="#f3d990" font-family="Georgia" font-size="35">THREE DAYS. TWELVE SETS.</text></svg>`);

const seededLines = [
  "You chose one stage while three others kept playing.",
  "You stayed for 47 minutes.",
  "You shot 43 photos of your friends.",
  "You stayed through 4 full sets.",
  "Your weekend crossed 5 stages.",
  "You found 4 artists you had not saved before.",
];

export default function WrappedPage() {
  return (
    <SwipeDeck>
      <OpeningCard imageUrl={openingCard} artistName="Thundercat" stageName="Sutro" dateLabel="Sun Aug 9" />
      {seededLines.map((line, index) => <StatCard key={line} line={line} index={index} />)}
      <StripReveal initialStripUrl={strip} />
      <LastCard show={{
        artistName: "Thundercat",
        venue: "Fox Theater",
        city: "Oakland",
        dateLabel: "Nov 17",
        spotifyUrl: "https://open.spotify.com/artist/4frXpPxQQZwbCu3eTGnZEw",
      }} />
    </SwipeDeck>
  );
}
