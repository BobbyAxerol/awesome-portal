---
version: alpha
name: Blackrock
description: "BlackRock is one of the world’s preeminent asset management firms and a premier provider of investment management. Find out more information here."
sourceUrl: "https://www.blackrock.com/"

colors:
  text: "#000000"
  accent: "#005eb8"
  border: "#000000"
  primary: "#ff4713"
  surface: "#ffffff"
  background: "#000000"
  on-primary: "#ffffff"
  text-muted: "#ffffff"

typography:
  display:
    fontFamily: "FortExtraBold, Arial, sans-serif"
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.25
  heading:
    fontFamily: "FortExtraBold, Arial, sans-serif"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "FortBook, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33

spacing:
  base: 4px
  scale: [4, 8, 12, 16, 24, 32, 40, 52, 80, 96]

radius:
  sm: 32px

shadows:
  card: "rgba(112, 112, 112, 0.5) 0px 0px 12px 0px"
  elevated: "rgba(112, 112, 112, 0.5) 0px 0px 12px 0px"

motion:
  duration-fast: 100ms
  duration-base: 300ms
  duration-slow: 300ms
  easing: "ease"

breakpoints: [359px, 400px, 425px, 426px, 550px, 600px, 768px, 769px, 890px, 897px, 980px, 1024px, 1145px, 1280px, 1439px, 1440px, 1480px, 1630px, 1920px]
---

## Rationale

Measured design tokens extracted from https://www.blackrock.com/. The frontmatter above is the design system — real colors, type scale, spacing, radius, shadows, motion, and breakpoints read from the live page. Upgrade to Pro for the full written system (rationale, component guidance, and accessibility notes).
