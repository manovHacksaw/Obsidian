# Design System Document



## 1. Overview & Creative North Star: "The Obsidian Architect"



This design system is engineered for the elite developer ecosystem. It moves beyond the utilitarian "dashboard" look to embrace **The Obsidian Architect**—a North Star that prioritizes high-contrast editorial layouts, structural modularity, and a "black-box" high-tech aesthetic.



The system rejects the standard 12-column flat grid in favor of intentional asymmetry. By utilizing large-scale hero typography (`display-lg`) and offset feature sidebars, we create a sense of focused power. The interface should feel less like a website and more like a high-performance terminal or a premium physical hardware interface, where depth is expressed through tonal shifts rather than heavy lines.



---



## 2. Colors & Surface Philosophy



The palette is rooted in deep, charcoal blacks (`#0e0e0e`) and punctuated by a high-energy, "Vivid Ember" orange (`#ff8f6f`).



### The "No-Line" Rule

Standard 1px borders are strictly prohibited for defining layout sections. Instead, separation is achieved through background color shifts. A section might transition from `surface` to `surface-container-low` to define a new content block. This creates a more sophisticated, seamless experience.



### Surface Hierarchy & Nesting

Treat the UI as a physical stack of technical components. Use the following tiers to create "nested" depth:

* **Base:** `surface` (#0e0e0e)

* **Sectioning:** `surface-container` (#1a1919)

* **Component Backgrounds:** `surface-container-high` (#201f1f)

* **Floating Elements:** `surface-container-highest` (#262626)



### The "Glass & Gradient" Rule

To escape the "flat" look, floating modals and navigation bars should utilize **Glassmorphism**. Apply a backdrop-blur (12px–20px) with a semi-transparent `surface_variant` fill.



### Signature Textures

Main CTAs and critical data highlights must use a subtle linear gradient transitioning from `primary_fixed` (#ff7851) to `primary` (#ff8f6f). For high-tech "glow" effects, use an outer glow on primary elements with the `surface_tint` color at 15% opacity.



---



## 3. Typography: Editorial Technicality



We use a high-contrast typographic pairing to balance "Human Editorial" with "Developer Precision."



* **Headlines (Epilogue):** This bold sans-serif is used for `display` and `headline` scales. It should be tracked tightly (-0.02em) to feel authoritative and architectural.

* **Body & UI (Space Grotesk):** This typeface offers a slight "monospaced hint" that resonates with technical users. It provides the precision of a terminal with the readability of a premium sans-serif.



| Scale | Font | Size | Usage |

| :--- | :--- | :--- | :--- |

| **Display-LG** | Epilogue | 3.5rem | Hero statements and impact titles. |

| **Headline-MD** | Epilogue | 1.75rem | Section headers. |

| **Title-SM** | Space Grotesk | 1rem | Card titles and prominent labels. |

| **Body-MD** | Space Grotesk | 0.875rem | General UI and technical descriptions. |

| **Label-SM** | Space Grotesk | 0.6875rem | Metadata, tags, and small utility text. |



---



## 4. Elevation & Depth



We eschew traditional drop shadows for **Tonal Layering**.



* **The Layering Principle:** Depth is achieved by "stacking." A card (`surface-container-lowest`) placed on a section (`surface-container-low`) creates a natural visual lift without the clutter of shadows.

* **Ambient Shadows:** For floating menus, use a "Ghost Shadow."

* *Values:* `0px 20px 40px rgba(0, 0, 0, 0.4)`.

* Always tint the shadow with the `surface` color to ensure it feels like part of the environment.

* **The "Ghost Border" Fallback:** If a boundary is required for accessibility, use a "Ghost Border": the `outline-variant` token at 20% opacity. Never use 100% opaque borders.



---



## 5. Components



### Buttons

* **Primary:** Solid gradient (`primary_fixed` to `primary`). 4px (`md`) roundedness. Bold `on_primary_fixed` text.

* **Secondary:** Ghost style. Transparent background with a `Ghost Border` (`outline-variant` @ 40%).

* **Tertiary:** Text-only in `primary` color, used for low-emphasis navigation.



### Input Fields

* **Styling:** Use `surface-container-highest` for the field background.

* **States:** On focus, the background remains dark, but a 1px "glow" border appears using `primary_dim` at 50% opacity.

* **Typography:** All input text uses `body-md` in Space Grotesk.



### Cards & Feature Lists

* **Rule:** Forbid divider lines.

* **Separation:** Use the Spacing Scale (e.g., `8` (2rem) or `12` (3rem)) to create breathing room.

* **Interactions:** On hover, a card should shift from `surface-container` to `surface-container-high`, providing immediate haptic-like visual feedback.



### Status Chips

* Compact, `sm` roundedness (0.125rem).

* Use `error_container` with `on_error_container` text for critical alerts, maintaining the dark-tech aesthetic.



---



## 6. Do's and Don'ts



### Do

* **Use Asymmetry:** Offset your hero text to the left and your primary visual/sidebar to the right.

* **Respect the Dark:** Use `surface_container_lowest` (#000000) for deep-stacking elements to create "void-like" depth.

* **Embrace Large Type:** Use `display-lg` for single, powerful words that set the tone of a page.



### Don't

* **Don't Use Pure White Borders:** This breaks the Obsidian aesthetic. Use `outline_variant` at low opacity.

* **Don't Use Standard Shadows:** Avoid high-contrast, "dirty" grey shadows.

* **Don't Overcrowd:** The technical nature of the app requires breathing room. If in doubt, increase spacing from `6` (1.5rem) to `10` (2.5rem).

* **Don't Mix Rounding Scales:** Stick to `md` (0.375rem) for UI components and `sm` (0.125rem) for status indicators to maintain a sharp, precise feel.