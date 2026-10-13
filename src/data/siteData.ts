export interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  image: string;
  description: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  location: string;
  image: string;
  category: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  image: string;
  features: string[];
}

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  poster: string;
  /** Renditions of the same clip; the slider picks one to suit the screen. */
  video?: { hd: string; qhd: string; uhd?: string };
  cta: { label: string; to: string };
};

const unsplash = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=${w > 2000 ? 85 : 80}`;
const pexelsVideo = (id: string, file: string) => `https://videos.pexels.com/video-files/${id}/${file}.mp4`;
const pexels = (id: string, w = 1000) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
const squarespace = (path: string, w = 1500) =>
  `https://images.squarespace-cdn.com/content/v1/55fc3ac9e4b09a0dc28a5bd2/${path}?format=${w}w`;

/** Real project photography from baydesignstore.com */
export const projectPhotos = {
  diningRoom: squarespace('a7cf9529-32b8-415c-8484-a3480aff9633/Dining+room+1.jpg', 2500),
  klymGreatRoom: squarespace('1588947684776-OLCXC37FZPVT4BVTBU4U/Klym%2BGreat%2BRoom%2B2%2Bweb.jpg', 2500),
  sandPointe: squarespace('991bb091-d5ba-4c72-89c6-6e9c47941e24/final2web-flat-6809+Sand+Pointe+Cir_LivingRoom01.jpg', 2500),
  pitchApple: squarespace('1588947956731-6LS0ETXKUGPWF0OG5JWO/713%2BPitch%2BApple%2BGreat%2BRoom%2B3%2Bweb.jpg', 2500),
};

export const companyInfo = {
  name: 'Bay Design Store',
  tagline: 'Fine Furniture & Full-Service Interior Design',
  founder: 'Susan Bay',
  founded: 1979,
  naplesFounded: 2003,
  phone: '(239) 649-0906',
  warehousePhone: '(239) 778-9709',
  email: 'info@baydesignstore.com',
  address: '326 13th Avenue South, Naples, FL 34102',
  warehouseAddress: '5510 Shirley Street, Naples, FL 34109',
  hoursDowntown: 'Mon–Fri 9am–5:30pm · Sat 9am–5pm · Sun 10am–4pm',
  hoursWarehouse: 'Mon–Fri 9am–5:30pm · Sat 9am–5pm · Sun Closed',
  instagram: 'https://www.instagram.com/baydesignstore/',
  facebook: 'https://www.facebook.com/BayDesignStore',
  ownerImage: squarespace('1560182571673-EZ8LVMAVA6EX0O1899SN/Susan%2B-%2B2019.jpg', 1000),
  ownerQuote: 'It is my desire to have the store be a reflection of our coastal location and lush tropical surroundings, to blend simplicity with luxury, and to help our clients achieve their own perfect Florida home.',
  ownerBio: 'Since its conception, Susan has concentrated on establishing Bay Design Store in Naples as one of the most unique and successful home furnishing boutiques and interior design firms in Southwest Florida. Before opening Bay Design Store in Naples in 2003, Susan founded Bay Design Store in Ann Arbor, Michigan in 1979. She operated both the Ann Arbor and Naples locations for 9 years before making the decision in 2012 to focus on Naples entirely. After more than 35 years in business, Susan is recognized as one of the leading entrepreneurs in the home furnishings and interior design industries.',
  philosophy: 'Our goal is to have happy clients. At Bay Design Store we work with you to create the rooms you love — for the places you live.',
};

export const heroSlides: HeroSlide[] = [
  {
    id: 'living',
    eyebrow: 'Naples, Florida · Since 1979',
    title: 'Fine Furniture & Full‑Service Interior Design',
    text: 'Designer-curated home furnishings and an ever-changing collection of ready-to-deliver pieces. Let us help you create a home you’ll truly love.',
    poster: unsplash('1615529182904-14819c35db37', 2400),
    video: {
      hd: pexelsVideo('34874524', '14777096_1920_1080_25fps'),
      qhd: pexelsVideo('34874524', '14777098_2560_1440_25fps'),
      uhd: pexelsVideo('34874524', '14777099_3840_2160_25fps'),
    },
    cta: { label: 'Explore Collections', to: '/collections' },
  },
  {
    id: 'dining',
    eyebrow: 'Our Design Portfolio',
    title: 'Elegant, Relaxed Rooms for the Places You Live',
    text: 'From a single statement room to a complete Gulf-front residence, our designers shape spaces around the way you live.',
    poster: unsplash('1617806118233-18e1de247200', 3000),
    cta: { label: 'View Portfolio', to: '/portfolio' },
  },
  {
    id: 'coastal',
    eyebrow: 'Coastal Elegance',
    title: 'Simplicity Blended with Luxury',
    text: 'A reflection of our coastal location and lush tropical surroundings — helping you achieve your own perfect Florida home.',
    poster: unsplash('1503174971373-b1f69850bded', 2400),
    video: {
      hd: pexelsVideo('39576530', '16868217_1920_1080_30fps'),
      qhd: pexelsVideo('39576530', '16868221_2560_1440_30fps'),
      uhd: pexelsVideo('39576530', '16868224_3840_2160_30fps'),
    },
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'great-room',
    eyebrow: 'Hand-Selected by Susan Bay',
    title: 'Furniture & Accents That Finish a Room',
    text: 'Sofas, sectionals, lighting, gallery-quality art and one-of-a-kind accessories — curated for coastal living.',
    poster: unsplash('1616486338812-3dadae4b4ace', 2400),
    video: {
      hd: pexelsVideo('7533207', '7533207-hd_1920_1080_30fps'),
      qhd: pexelsVideo('7533207', '7533207-uhd_2560_1440_30fps'),
    },
    cta: { label: 'Shop the Store', to: '/collections' },
  },
  {
    id: 'bedroom',
    eyebrow: 'The “Instant” Design Program',
    title: 'Furnish a Room — or a Home — Almost Instantly',
    text: 'A complimentary in-home consultation, designer selections from our showroom, then delivery and installation by our white-glove team.',
    poster: unsplash('1616594039964-ae9021a400a0', 2400),
    video: {
      hd: pexelsVideo('39024331', '16605507_1920_1080_30fps'),
      qhd: pexelsVideo('39024331', '16605509_2560_1440_30fps'),
    },
    cta: { label: 'Discover Services', to: '/services' },
  },
  {
    id: 'sand-pointe',
    eyebrow: 'Downtown & North Naples',
    title: 'Visit Our Showroom & Warehouse',
    text: 'Experience our furniture in person on 13th Avenue South, or discover ready-to-deliver finds at our North Naples warehouse.',
    poster: unsplash('1600210492486-724fe5c67fb0', 3000),
    cta: { label: 'Book a Visit', to: '/contact' },
  },
];

export const galleryImages = [
  { src: projectPhotos.pitchApple, title: 'Pitch Apple Great Room', tag: 'Great Room' },
  { src: unsplash('1618221195710-dd6b41faaea6', 1200), title: 'Sunlit Family Lounge', tag: 'Living' },
  { src: unsplash('1615529182904-14819c35db37', 1200), title: 'Rattan & Linen Retreat', tag: 'Living' },
  { src: unsplash('1617098900591-3f90928e8c54', 1200), title: 'Crystal Primary Suite', tag: 'Bedroom' },
  { src: projectPhotos.sandPointe, title: 'Sand Pointe Living Room', tag: 'Living' },
  { src: unsplash('1617806118233-18e1de247200', 1200), title: 'Garden Dining Room', tag: 'Dining' },
  { src: unsplash('1631679706909-1844bbd07221', 1200), title: 'Soft Neutral Salon', tag: 'Living' },
  { src: unsplash('1600489000022-c2086d79f9d4', 1200), title: 'Coastal Kitchen', tag: 'Kitchen' },
  { src: unsplash('1505693416388-ac5ce068fe85', 1200), title: 'Classic Guest Suite', tag: 'Bedroom' },
  { src: unsplash('1600573472550-8090b5e0745e', 1200), title: 'Open-Plan Great Room', tag: 'Great Room' },
  { src: unsplash('1556228453-efd6c1ff04f6', 1200), title: 'Woven Textures Lounge', tag: 'Living' },
  { src: unsplash('1571508601891-ca5e7a713859', 1200), title: 'Warm Layered Bedroom', tag: 'Bedroom' },
];

export const roomCategories = [
  { name: 'Living Rooms', count: 'Sofas · Sectionals · Chairs', image: unsplash('1616486338812-3dadae4b4ace', 1400) },
  { name: 'Bedrooms', count: 'Beds · Nightstands · Linens', image: unsplash('1616594039964-ae9021a400a0', 1000) },
  { name: 'Dining', count: 'Tables · Chairs · Consoles', image: projectPhotos.diningRoom },
  { name: 'Lighting', count: 'Chandeliers · Lamps · Sconces', image: unsplash('1513694203232-719a280e022f', 1000) },
  { name: 'Art & Accents', count: 'Paintings · Vases · Mirrors', image: unsplash('1532372320572-cda25653a26d', 1000) },
];

export const collections: Product[] = [
  { id: 'sofa-1', name: 'Coastal Cloud Sofa', category: 'Sofas', price: '$4,200', image: pexels('8135275', 900), description: 'Plush tufted sofa with brass detailing, hand-selected for the Naples lifestyle.' },
  { id: 'sofa-2', name: 'Palm Grove Velvet Sofa', category: 'Sofas', price: '$3,950', image: unsplash('1555041469-a586c61ea9bc', 900), description: 'Deep emerald velvet with tapered legs — a jewel-toned anchor for any room.' },
  { id: 'sofa-3', name: 'Harbor Tufted Sofa', category: 'Sofas', price: '$4,600', image: unsplash('1493663284031-b7e3aefcae8e', 900), description: 'Soft dove-grey upholstery with a classic button-tufted back.' },
  { id: 'chair-1', name: 'Emerald Velvet Accent Chair', category: 'Chairs', price: '$1,450', image: pexels('12379606', 900), description: 'Sculptural green velvet chair on slender gold legs.' },
  { id: 'chair-2', name: 'Saffron Lounge Chair', category: 'Chairs', price: '$1,290', image: unsplash('1586023492125-27b2c045efd7', 900), description: 'A sunny mid-century lounge chair that brightens any corner.' },
  { id: 'vase-1', name: 'Blue Floral Porcelain Vases', category: 'Accents', price: '$320', image: pexels('27824607', 900), description: 'Hand-painted blue and white porcelain, perfect with white orchids.' },
  { id: 'vase-2', name: 'Lagoon Glass Vessels', category: 'Accents', price: '$185', image: pexels('11529878', 900), description: 'Artisan blown glass in a deep Gulf-green hue.' },
  { id: 'console-1', name: 'Ornate White Console', category: 'Tables', price: '$2,400', image: pexels('37711147', 900), description: 'Classic carved console with matching mirror.' },
  { id: 'console-2', name: 'Minimalist Ebony Console', category: 'Tables', price: '$1,650', image: pexels('7195530', 900), description: 'A sculptural dark-wood console styled with tall blue vases.' },
  { id: 'cabinet-1', name: 'Walnut & Brass Sideboard', category: 'Tables', price: '$3,200', image: pexels('8135256', 900), description: 'Fluted walnut cabinet with brass legs, styled with lamps and mirror.' },
  { id: 'lighting-1', name: 'Arc Floor Lamp', category: 'Lighting', price: '$680', image: unsplash('1513694203232-719a280e022f', 900), description: 'A slim, sculptural floor lamp for reading corners.' },
  { id: 'accent-2', name: 'Travertine Console Styling', category: 'Accents', price: '$540', image: unsplash('1532372320572-cda25653a26d', 900), description: 'A curated vignette of stone, ceramics and art books.' },
];

export const portfolioItems: PortfolioItem[] = [
  { id: 'p1', title: 'Klym Great Room', location: 'Naples, FL', image: projectPhotos.klymGreatRoom, category: 'Living Room' },
  { id: 'p2', title: 'Formal Dining Room', location: 'Naples, FL', image: projectPhotos.diningRoom, category: 'Dining Room' },
  { id: 'p3', title: 'Sand Pointe Living Room', location: 'Naples, FL', image: projectPhotos.sandPointe, category: 'Living Room' },
  { id: 'p4', title: 'Pitch Apple Great Room', location: 'Naples, FL', image: projectPhotos.pitchApple, category: 'Living Room' },
  { id: 'p5', title: 'Crystal Primary Suite', location: 'Naples, FL', image: unsplash('1617098900591-3f90928e8c54', 1200), category: 'Bedroom' },
  { id: 'p6', title: 'Garden Dining Room', location: 'Naples, FL', image: unsplash('1617806118233-18e1de247200', 1200), category: 'Dining Room' },
  { id: 'p7', title: 'Rattan & Linen Retreat', location: 'Naples, FL', image: unsplash('1615529182904-14819c35db37', 1200), category: 'Living Room' },
  { id: 'p8', title: 'Serene Guest Suite', location: 'Naples, FL', image: unsplash('1595526114035-0d45ed16cfbf', 1200), category: 'Bedroom' },
  { id: 'p9', title: 'Coastal Kitchen', location: 'Naples, FL', image: unsplash('1600489000022-c2086d79f9d4', 1200), category: 'Kitchen' },
  { id: 'p10', title: 'Velvet Primary Bedroom', location: 'Naples, FL', image: unsplash('1616594039964-ae9021a400a0', 1200), category: 'Bedroom' },
  { id: 'p11', title: 'Breakfast Nook', location: 'Naples, FL', image: unsplash('1522708323590-d24dbb6b0267', 1200), category: 'Dining Room' },
  { id: 'p12', title: 'Sunlit Family Lounge', location: 'Naples, FL', image: unsplash('1618221195710-dd6b41faaea6', 1200), category: 'Living Room' },
  { id: 'p13', title: 'Marble Island Kitchen', location: 'Naples, FL', image: unsplash('1507089947368-19c1da9775ae', 1200), category: 'Kitchen' },
  { id: 'p14', title: 'Warm Layered Bedroom', location: 'Naples, FL', image: unsplash('1571508601891-ca5e7a713859', 1200), category: 'Bedroom' },
];

export const services: Service[] = [
  {
    id: 'instant-design',
    title: 'Instant Design Program',
    description: 'Our exclusive complimentary service can help you furnish a room or home almost instantly. A designer meets you in your home to determine what pieces are needed to achieve a finished, designer-detailed look — from furniture and lighting to art and accessories.',
    icon: 'Sparkles',
    image: unsplash('1600210492486-724fe5c67fb0', 1800),
    features: ['In-home consultation', 'Designer-curated selections', 'Expert installation & arrangement', 'Same-day delivery available'],
  },
  {
    id: 'full-service-design',
    title: 'Full-Service Interior Design',
    description: 'Our professionally trained designers help you find and select all the elements needed to furnish your home and create beautiful rooms that exceed your expectations.',
    icon: 'Home',
    image: unsplash('1560448204-e02f11c3d0e2', 1800),
    features: ['Space planning', 'Color & fabric consultation', 'Custom furniture ordering', 'Complete room design'],
  },
  {
    id: 'white-glove',
    title: 'White Glove Delivery',
    description: 'Our delivery team is known for its prompt, courteous, and trustworthy service. They handle the most demanding deliveries and installations with care and understanding.',
    icon: 'Truck',
    image: unsplash('1600573472550-8090b5e0745e', 1800),
    features: ['Same-day delivery from showroom', 'Professional installation', 'Careful handling', 'Trusted & courteous team'],
  },
  {
    id: 'private-appointments',
    title: 'Private Appointments',
    description: 'To better serve our clients, we offer video and private appointments. Schedule a one-on-one session with our designers for personalized attention.',
    icon: 'Calendar',
    image: unsplash('1631679706909-1844bbd07221', 1800),
    features: ['Video consultations', 'Private in-store sessions', 'Personalized attention', 'Flexible scheduling'],
  },
  {
    id: 'custom-order',
    title: 'Custom Furniture Orders',
    description: 'We stock many styles of sofas, chairs, consoles, cabinets, tables, fabrics and pillows, so you can experience our furniture before you buy or place a custom order.',
    icon: 'Armchair',
    image: unsplash('1555041469-a586c61ea9bc', 1800),
    features: ['Experience before you buy', 'Custom upholstery options', 'Fabric & finish selection', 'Exclusive manufacturer lines'],
  },
  {
    id: 'art-gallery',
    title: 'Gallery-Quality Art',
    description: 'Susan’s superb eye for color and style shows in our rotating collection of unique accessories, original gallery-quality oil paintings and prints.',
    icon: 'Palette',
    image: unsplash('1615873968403-89e068629265', 1800),
    features: ['Original oil paintings', 'Curated prints', 'Unique accessories', 'Rotating collection'],
  },
];

/** Services-page FAQ — shown on the page and published as FAQPage structured data. */
export const faqs = [
  {
    q: 'Where is Bay Design Store located?',
    a: 'We have two locations in Naples, Florida: the Downtown showroom at 326 13th Avenue South, Naples, FL 34102, and the Bay Design warehouse and North Naples showroom at 5510 Shirley Street, Naples, FL 34109.',
  },
  {
    q: 'What areas does your interior design team serve?',
    a: 'Our design team is based in Naples and works with homeowners throughout Southwest Florida, including Naples, Marco Island, Bonita Springs, Estero and Fort Myers. If your home is elsewhere in Florida or in another state, contact us to discuss your project.',
  },
  {
    q: 'What is the Instant Design Program?',
    a: 'A complimentary service that helps you furnish a room or home quickly. A designer visits your home, selects furniture, lighting, art and accessories from our in-stock collection, and our team delivers, installs and arranges everything.',
  },
  {
    q: 'Do you offer full-service interior design?',
    a: 'Yes. Our professionally trained designers handle space planning, color and fabric consultation, custom furniture ordering and complete room design for whole homes, new construction and renovations.',
  },
  {
    q: 'Can I see furniture in person before buying?',
    a: 'Yes. We stock many styles of sofas, chairs, consoles, cabinets, tables, fabrics and pillows in our Downtown showroom and North Naples warehouse, so you can experience pieces before you buy or place a custom order.',
  },
  {
    q: 'Do you deliver and install furniture?',
    a: 'Our white-glove delivery team provides prompt, careful delivery and professional installation. Same-day delivery is often available for in-stock pieces in the Naples area.',
  },
  {
    q: 'Can I book a private or video appointment?',
    a: 'Yes. We offer private in-store appointments and video consultations. Call (239) 649-0906 or use the contact form to schedule.',
  },
];

export const instantSteps = [
  { title: 'Meet in Your Home', text: 'A Bay Design designer visits to understand your space, light, and the way you live.' },
  { title: 'Curate the Pieces', text: 'We select furniture, lighting, art and accessories from our extensive in-stock collection.' },
  { title: 'Deliver & Install', text: 'Our white-glove team delivers, installs, and arranges every piece with care.' },
  { title: 'Enjoy the Finished Room', text: 'Walk into a finished, designer-detailed room — often in a matter of days.' },
];

export const timeline = [
  { year: '1979', title: 'Founded in Ann Arbor', text: 'Susan Bay opens the first Bay Design Store in Ann Arbor, Michigan.' },
  { year: '2003', title: 'Naples Opens', text: 'Bay Design Store arrives in Naples, Florida — inspired by coastal living.' },
  { year: '2012', title: 'All-In on Naples', text: 'After nine years running both stores, Susan focuses entirely on Naples.' },
  { year: 'Today', title: 'Designing for Sherrill', text: 'Susan designs the DC Collection for Sherrill Furniture, shown at High Point Market.' },
];

export const instagramImages = [
  projectPhotos.pitchApple,
  unsplash('1616137466211-f939a420be84', 700),
  unsplash('1618220179428-22790b461013', 700),
  unsplash('1615874959474-d609969a20ed', 700),
  unsplash('1598928506311-c55ded91a20c', 700),
  unsplash('1505691938895-1758d7feb511', 700),
];

export const stats = [
  { label: 'Years in Business', value: 45, suffix: '+' },
  { label: 'Design Projects', value: 2000, suffix: '+' },
  { label: 'Happy Clients', value: 5000, suffix: '+' },
  { label: 'Showrooms in Naples', value: 2, suffix: '' },
];

export { blogPosts, type BlogPost } from './journal';

export const pageImages = {
  // Full-screen backgrounds need ~3000px sources; the Squarespace project photos are only 520–1000px wide.
  about: unsplash('1598928506311-c55ded91a20c', 3000),
  aboutSecondary: unsplash('1600607687939-ce8a6c25118c', 2600),
  collections: unsplash('1616486338812-3dadae4b4ace', 3000),
  services: unsplash('1600210492486-724fe5c67fb0', 3000),
  portfolio: unsplash('1618221195710-dd6b41faaea6', 3000),
  journal: pexels('276508', 2600),
  contact: unsplash('1600607687939-ce8a6c25118c', 3000),
  cta: unsplash('1615529182904-14819c35db37', 2600),
  sherrill: pexels('8135256', 1400),
  intro1: unsplash('1615873968403-89e068629265', 1200),
  intro2: unsplash('1505691938895-1758d7feb511', 900),
  downtown: projectPhotos.diningRoom,
  warehouse: unsplash('1600121848594-d8644e57abab', 1400),
};

export const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'About', path: '/about' },
  { label: 'Collections', path: '/collections' },
  { label: 'Services', path: '/services' },
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Journal', path: '/blog' },
  { label: 'Contact', path: '/contact' },
];
