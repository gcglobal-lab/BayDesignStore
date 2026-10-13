export interface BlogSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogPost {
  id: string;
  title: string;
  /** Shorter title for the browser tab and Google result (aim for under ~60 characters). */
  seoTitle: string;
  category: string;
  date: string;
  /** ISO date for search engines. */
  isoDate: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  keywords: string[];
  body: BlogSection[];
}

const unsplash = (id: string, w = 2400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=82`;
const pexels = (id: string, w = 2600) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

const visitClose: BlogSection = {
  heading: 'Visit Bay Design Store in Naples',
  paragraphs: [
    'Bay Design Store has two Naples locations: our Downtown showroom at 326 13th Avenue South, and our North Naples showroom and warehouse at 5510 Shirley Street. Call (239) 649-0906 to book a private appointment or a complimentary Instant Design consultation.',
  ],
};

export const blogPosts: BlogPost[] = [
  {
    id: 'best-interior-designer-florida',
    title: 'How to Choose the Best Interior Designer in Florida — 9 Questions to Ask First',
    seoTitle: 'How to Choose the Best Interior Designer in Florida',
    category: 'Design Advice',
    date: 'October 8, 2026',
    isoDate: '2026-10-08',
    excerpt: 'Searching for the best interior designer in Florida? Here is what to look for — portfolio, process, sourcing, delivery and local know-how — before you hire.',
    image: unsplash('1618221195710-dd6b41faaea6'),
    imageAlt: 'Sunlit Florida living room designed with warm neutral furniture',
    keywords: ['best interior designer in Florida', 'Florida interior designer', 'interior designer near me', 'Naples interior designer', 'luxury interior designer Florida', 'how to choose an interior designer'],
    body: [
      {
        heading: 'Start with the way you want to live',
        paragraphs: [
          'The best interior designer for your Florida home is the one whose rooms feel like the way you want to live — not simply the one with the most awards. Before you call anyone, list how you use each space: entertaining, family time, working from home, or seasonal living.',
          'A good designer will ask about these habits in the first conversation. If the discussion jumps straight to colors and catalogs, keep looking.',
        ],
      },
      {
        heading: 'Look for real, local work',
        paragraphs: [
          'Florida homes have their own challenges: intense sun, humidity, open floor plans and indoor-outdoor living. Ask to see finished rooms from homes like yours, ideally nearby. At Bay Design Store our portfolio is built from homes across Naples and Southwest Florida.',
        ],
      },
      {
        heading: '9 questions to ask an interior designer',
        paragraphs: [
          '1) What is your design process from first meeting to installation? 2) Can I see and touch the furniture before buying? 3) Do you have in-stock pieces, or is everything special-order? 4) How long do custom orders take? 5) Who handles delivery and installation? 6) How do you charge — by project, by hour, or through product? 7) Do you offer a smaller, faster option for a single room? 8) How do you choose fabrics that survive Florida sun? 9) Who will be my day-to-day contact?',
          'Clear answers to these questions tell you more than any ranking list.',
        ],
      },
      {
        heading: 'Why a showroom-based designer helps',
        paragraphs: [
          'Working with a design firm that also runs a furniture showroom means you can sit on the sofa before you commit, and many pieces can be delivered quickly. Our complimentary Instant Design Program uses exactly this: a designer visits your home, selects pieces from our in-stock collection, and our white-glove team delivers and arranges them.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'naples-furniture-warehouse',
    title: 'The Bay Design Warehouse: A Guide to Our Naples Furniture Showroom & Warehouse',
    seoTitle: 'Bay Design Warehouse | Naples Furniture Warehouse Guide',
    category: 'From the Warehouse',
    date: 'October 5, 2026',
    isoDate: '2026-10-05',
    excerpt: 'Everything you need to know before visiting the Bay Design warehouse in North Naples — what you will find, hours, delivery, and how to shop it with a designer.',
    image: unsplash('1600121848594-d8644e57abab'),
    imageAlt: 'Modern living room furniture on display at a Naples furniture showroom',
    keywords: ['Bay Design warehouse', 'Bay Design Store warehouse', 'Naples furniture warehouse', 'furniture store North Naples', 'furniture store Naples FL', 'ready to deliver furniture Naples'],
    body: [
      {
        heading: 'Where is the Bay Design warehouse?',
        paragraphs: [
          'The Bay Design North Naples showroom and warehouse is at 5510 Shirley Street, Naples, FL 34109. It is open Monday to Friday 9am–5:30pm and Saturday 9am–5pm (closed Sunday). Call the warehouse directly at (239) 778-9709.',
        ],
      },
      {
        heading: 'What you will find',
        paragraphs: [
          'The warehouse carries an ever-changing selection of sofas, sectionals, chairs, dining tables, consoles, cabinets, lighting, art and accessories — much of it ready for delivery. Because stock moves quickly, we recommend visiting often or following @baydesignstore on Instagram for new arrivals.',
        ],
      },
      {
        heading: 'Shop the warehouse with a designer',
        paragraphs: [
          'You are welcome to browse on your own, but you can also book time with one of our designers. They can pull together a complete room on the spot, suggest custom fabrics, and coordinate pieces from both our warehouse and our Downtown showroom.',
        ],
      },
      {
        heading: 'Delivery and installation',
        paragraphs: [
          'Our white-glove delivery team handles everything from a single chair to a fully furnished home, with professional installation and careful handling. Same-day delivery is often possible for in-stock pieces.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'naples-interior-design-trends-2026',
    title: 'The 2026 Naples Interior Design Edit: Warm Materials, Open Views, and Quiet Luxury',
    seoTitle: 'Naples Interior Design Trends 2026 | Bay Design Store',
    category: 'Interior Design Trends',
    date: 'October 2, 2026',
    isoDate: '2026-10-02',
    excerpt: 'Discover the colors, textures, natural woods, and relaxed silhouettes shaping beautiful Florida homes this season.',
    image: pexels('14495875'),
    imageAlt: 'Elegant coastal living room with natural textures and warm neutral furniture',
    keywords: ['Naples interior design trends', 'Florida interior design trends 2026', 'quiet luxury interiors', 'coastal interior design'],
    body: [
      {
        heading: 'Warm neutrals replace stark white',
        paragraphs: [
          'Across Naples, the bright white coastal look is softening into sand, oat, linen and warm ivory. These tones glow in Gulf light without feeling cold, and they pair beautifully with natural wood and woven textures.',
        ],
      },
      {
        heading: 'Natural materials, layered',
        paragraphs: [
          'Rattan pendants, travertine side tables, pale oak and textured linens bring depth to open-plan Florida rooms. The key is layering: mix two or three materials per room so the space feels collected rather than themed.',
        ],
      },
      {
        heading: 'Furniture that frames the view',
        paragraphs: [
          'Low-profile sofas and swivel chairs keep sightlines open to the water and lanai. Arrange seating to face both the view and each other — conversation first, television second.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'southwest-florida-luxury-interior-design',
    title: 'Luxury Interior Design in Southwest Florida: Naples, Marco Island, Bonita Springs & Fort Myers',
    seoTitle: 'Luxury Interior Design in Southwest Florida',
    category: 'Florida Living',
    date: 'September 30, 2026',
    isoDate: '2026-09-30',
    excerpt: 'What makes a Southwest Florida home feel luxurious — and how our Naples design team approaches homes from Port Royal and Pelican Bay to Marco Island and Fort Myers.',
    image: unsplash('1600573472550-8090b5e0745e'),
    imageAlt: 'Open-plan luxury great room in a Southwest Florida home',
    keywords: ['luxury interior design Southwest Florida', 'interior designer Marco Island', 'interior designer Bonita Springs', 'interior designer Fort Myers', 'Naples luxury interior design', 'Collier County interior designer'],
    body: [
      {
        heading: 'Designing for Gulf Coast light',
        paragraphs: [
          'Southwest Florida light is strong and changes through the day. We choose performance fabrics and finishes that resist fading, and layer window treatments so rooms stay comfortable without losing the view.',
        ],
      },
      {
        heading: 'Neighborhoods we know',
        paragraphs: [
          'From Old Naples and Port Royal to Pelican Bay, Park Shore, Marco Island, Bonita Springs, Estero and Fort Myers, every community has its own architecture — Mediterranean, British West Indies, contemporary and classic coastal. Our designers tailor each home to its setting rather than applying one look everywhere.',
        ],
      },
      {
        heading: 'Seasonal homes, ready on arrival',
        paragraphs: [
          'Many Southwest Florida homeowners split their year. We can plan, order, deliver and install while you are away, so your home is finished — beds made, art hung — when you arrive.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'coastal-modern-furniture-naples',
    title: 'How to Create a Coastal Modern Home Without Going Overboard',
    seoTitle: 'Coastal Modern Home Design Tips | Bay Design Store',
    category: 'Style Guide',
    date: 'September 24, 2026',
    isoDate: '2026-09-24',
    excerpt: 'A practical guide to layering linen, pale oak, sculptural lighting, and collected accents for a refined coastal interior.',
    image: pexels('276508'),
    imageAlt: 'Bright luxury living room overlooking the ocean',
    keywords: ['coastal modern furniture', 'coastal interior design', 'Florida coastal decor', 'coastal living room ideas'],
    body: [
      {
        heading: 'Skip the theme, keep the feeling',
        paragraphs: [
          'Coastal modern is about light, air and texture — not anchors and seashells everywhere. Choose one or two meaningful coastal accents and let natural materials do the rest.',
        ],
      },
      {
        heading: 'A simple palette',
        paragraphs: [
          'Start with warm whites and sand, add a soft blue or sea-glass green, and ground it with one darker tone such as charcoal or walnut. Repeat each color at least three times in a room for a cohesive look.',
        ],
      },
      {
        heading: 'Sculptural lighting',
        paragraphs: [
          'Woven pendants, ceramic lamps and slim floor lamps add personality without clutter. In open plans, use pendants to define zones — dining, kitchen island, reading corner.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'florida-style-interior-design-southeast-usa',
    title: 'Bringing Florida Coastal Style to Homes Across the Southeast and the USA',
    seoTitle: 'Florida Coastal Interior Design for Homes Across the USA',
    category: 'Style Guide',
    date: 'September 20, 2026',
    isoDate: '2026-09-20',
    excerpt: 'Love the relaxed elegance of a Naples home? Here is how to bring Florida coastal style to homes in Georgia, Alabama, the Carolinas and beyond.',
    image: unsplash('1503174971373-b1f69850bded'),
    imageAlt: 'Light-filled living room with water views and coastal furnishings',
    keywords: ['USA interior design', 'coastal interior design Southeast', 'Florida style interior design', 'interior designer Georgia coastal', 'luxury interior design USA', 'coastal interior designer'],
    body: [
      {
        heading: 'Why Florida style travels well',
        paragraphs: [
          'The best Florida interiors balance simplicity with luxury — comfortable silhouettes, natural textures and a calm palette. That formula works just as well in an Atlanta townhome, a Carolina lake house or a Gulf Shores retreat.',
        ],
      },
      {
        heading: 'Adapting to your climate',
        paragraphs: [
          'In cooler or more seasonal climates, keep the light palette but add weight: wool throws, heavier linens, darker wood accents and layered rugs. Swap rattan for oak or walnut where it suits the architecture.',
        ],
      },
      {
        heading: 'Rooted in Florida, with Midwest beginnings',
        paragraphs: [
          'Bay Design Store began in Ann Arbor, Michigan in 1979 before Susan Bay opened in Naples in 2003, so our team understands how to translate coastal style for different homes and seasons.',
          'If you are furnishing a home outside Naples, contact our team to talk through your project — including furniture selections, custom orders and shipping options.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'bay-design-warehouse-finds',
    title: 'Inside the Bay Design Warehouse: Finding the Pieces That Finish a Room',
    seoTitle: 'Bay Design Warehouse Finds | Naples Furniture',
    category: 'From the Warehouse',
    date: 'September 15, 2026',
    isoDate: '2026-09-15',
    excerpt: 'Meet the one-of-a-kind furniture, lighting, art, and accessories our Naples design team is watching right now.',
    image: pexels('31817162'),
    imageAlt: 'Spacious modern living room with a wide ocean view',
    keywords: ['Bay Design warehouse', 'Naples furniture store', 'unique home accessories Naples', 'art and accessories Naples FL'],
    body: [
      {
        heading: 'The finishing layer',
        paragraphs: [
          'A room feels finished when the last 10% is right: a lamp at the right height, art at eye level, a tray that corrals the coffee table. Our warehouse is full of these pieces — often one of a kind.',
        ],
      },
      {
        heading: 'Gallery-quality art',
        paragraphs: [
          'Susan Bay curates a rotating collection of original oil paintings and prints. Bring a photo of your wall, or ask a designer to bring options to your home.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'instant-design-vs-full-service',
    title: 'Instant Design or Full-Service Interior Design: Which Is Right for Your Florida Home?',
    seoTitle: 'Instant Design vs Full-Service Interior Design | Naples',
    category: 'Design Advice',
    date: 'September 10, 2026',
    isoDate: '2026-09-10',
    excerpt: 'Compare our complimentary Instant Design Program with full-service interior design — timelines, scope, and which suits your project.',
    image: unsplash('1600210492486-724fe5c67fb0'),
    imageAlt: 'Furnished living room completed through an interior design program',
    keywords: ['full-service interior design Naples', 'Instant Design Program', 'interior design services Florida', 'furnish a home quickly Naples'],
    body: [
      {
        heading: 'The Instant Design Program',
        paragraphs: [
          'Best for furnishing a room or home quickly. A designer visits your home, selects furniture, lighting, art and accessories from our in-stock collection, and our team delivers and installs everything. The consultation is complimentary.',
        ],
      },
      {
        heading: 'Full-service interior design',
        paragraphs: [
          'Best for whole-home projects, new construction and renovations. Our designers handle space planning, color and fabric consultation, custom furniture ordering and complete room design from start to finish.',
        ],
      },
      {
        heading: 'Not sure? Start with a conversation',
        paragraphs: [
          'Many clients begin with one room through Instant Design and continue with full service later. Book a private or video appointment and we will recommend the right path.',
        ],
      },
      visitClose,
    ],
  },
  {
    id: 'florida-living-room-lighting',
    title: 'The Best Lighting Ideas for Florida Living Rooms',
    seoTitle: 'Florida Living Room Lighting Ideas | Bay Design Store',
    category: 'Design Advice',
    date: 'September 6, 2026',
    isoDate: '2026-09-06',
    excerpt: 'Use natural light, layered fixtures, and warm-glow lamps to make an open living space feel inviting from morning to evening.',
    image: pexels('12715501'),
    imageAlt: 'Minimal living room with natural light and ocean views',
    keywords: ['living room lighting ideas', 'Florida home lighting', 'lamps Naples FL', 'chandeliers Naples'],
    body: [
      {
        heading: 'Layer three kinds of light',
        paragraphs: [
          'Combine ambient light (ceiling fixtures or chandeliers), task light (reading and floor lamps) and accent light (picture lights, sconces). Dimmers on every layer let one room shift from bright morning to soft evening.',
        ],
      },
      {
        heading: 'Choose warm bulbs',
        paragraphs: [
          'In Florida homes with abundant daylight, warm 2700K bulbs keep evenings relaxed. Avoid cool white bulbs in living areas — they flatten textures and make neutrals look grey.',
        ],
      },
      visitClose,
    ],
  },
];
