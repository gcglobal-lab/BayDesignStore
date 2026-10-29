import { bayPhoto } from '@/lib/photos';

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

const squarespace = (path: string, w = 1500) =>
  `https://images.squarespace-cdn.com/content/v1/55fc3ac9e4b09a0dc28a5bd2/${path}?format=${w}w`;
/**
 * Our own showroom photography (photos by Stefania Pifferi), e.g. bay('hdr-13') or bay('12258').
 * Every image on the site renders through `responsive` (src/lib/photos.ts), so phones get small files.
 */
const bay = (name: string, w = 1600) => bayPhoto(`bay-${name}`, w);

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
    poster: bay('hdr-13', 2400),
    cta: { label: 'Explore Collections', to: '/collections' },
  },
  {
    id: 'great-room',
    eyebrow: 'Our Design Portfolio',
    title: 'Elegant, Relaxed Rooms for the Places You Live',
    text: 'From a single statement room to a complete Gulf-front residence, our designers shape spaces around the way you live.',
    poster: bay('hdr-11', 2400),
    cta: { label: 'View Portfolio', to: '/portfolio' },
  },
  {
    id: 'coastal',
    eyebrow: 'Coastal Elegance',
    title: 'Simplicity Blended with Luxury',
    text: 'A reflection of our coastal location and lush tropical surroundings — helping you achieve your own perfect Florida home.',
    poster: bay('hdr-6', 2400),
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'accents',
    eyebrow: 'Hand-Selected by Susan Bay',
    title: 'Furniture & Accents That Finish a Room',
    text: 'Sofas, sectionals, lighting, gallery-quality art and one-of-a-kind accessories — curated for coastal living.',
    poster: bay('hdr-7', 2400),
    cta: { label: 'Shop the Store', to: '/collections' },
  },
  {
    id: 'bedroom',
    eyebrow: 'The “Instant” Design Program',
    title: 'Furnish a Room — or a Home — Almost Instantly',
    text: 'A complimentary in-home consultation, designer selections from our showroom, then delivery and installation by our white-glove team.',
    poster: bay('hdr-10', 2400),
    cta: { label: 'Discover Services', to: '/services' },
  },
  {
    id: 'showroom',
    eyebrow: 'Downtown & North Naples',
    title: 'Visit Our Showroom & Warehouse',
    text: 'Experience our furniture in person on 13th Avenue South, or discover ready-to-deliver finds at our North Naples warehouse.',
    poster: bay('hdr-12', 2400),
    cta: { label: 'Book a Visit', to: '/contact' },
  },
];

export const galleryImages = [
  { src: bay('12258'), title: 'Coastal Primary Suite', tag: 'Bedroom' },
  { src: bay('12414'), title: 'Coral Gallery Lounge', tag: 'Living' },
  { src: bay('12609'), title: 'Palm Beach Console', tag: 'Accents' },
  { src: bay('12186'), title: 'Linen Reading Chair', tag: 'Living' },
  { src: bay('12223'), title: 'Seaglass Console Vignette', tag: 'Accents' },
  { src: bay('12263'), title: 'Bedside Seating Nook', tag: 'Bedroom' },
  { src: bay('12454'), title: 'Blue Coral Sitting Room', tag: 'Living' },
  { src: bay('12025'), title: 'Shell & Porcelain Nightstand', tag: 'Bedroom' },
  { src: bay('12632'), title: 'Sculpted Lamp & Palms', tag: 'Lighting' },
  { src: bay('12171'), title: 'Upholstered Bed Suite', tag: 'Bedroom' },
  { src: bay('12605'), title: 'Striped Linen Loveseat', tag: 'Living' },
  { src: bay('12235'), title: 'Sea Urchin Chandelier', tag: 'Lighting' },
];

export const roomCategories = [
  { name: 'Living Rooms', count: 'Sofas · Sectionals · Chairs', image: bay('hdr-13') },
  { name: 'Bedrooms', count: 'Beds · Nightstands · Linens', image: bay('12171', 960) },
  { name: 'Tables & Storage', count: 'Consoles · Sideboards · Chests', image: bay('12362', 960) },
  { name: 'Lighting', count: 'Chandeliers · Lamps · Sconces', image: bay('12601', 960) },
  { name: 'Art & Accents', count: 'Paintings · Vases · Mirrors', image: bay('12622', 960) },
];

export const collections: Product[] = [
  { id: 'sofa-1', name: 'Coastal Linen Loveseat', category: 'Sofas', price: '$4,200', image: bay('12605', 960), description: 'A soft track-arm loveseat in oatmeal linen, layered with striped pillows.' },
  { id: 'sofa-2', name: 'Palm Frond Sofa', category: 'Sofas', price: '$3,950', image: bay('12083', 960), description: 'Deep, relaxed seating in natural weave, dressed with hand-blocked palm-leaf pillows.' },
  { id: 'sofa-3', name: 'Harbor Stripe Sofa', category: 'Sofas', price: '$4,600', image: bay('12596', 960), description: 'Clean lines in warm sand upholstery with a classic ticking-stripe pillow.' },
  { id: 'chair-1', name: 'Linen Lounge Chair', category: 'Chairs', price: '$1,450', image: bay('12186', 960), description: 'A deep, sculpted lounge chair in textured linen on a dark-wood base.' },
  { id: 'chair-2', name: 'Harbor Swivel Chair', category: 'Chairs', price: '$1,290', image: bay('12275', 960), description: 'A tailored swivel chair in soft blue-grey weave — perfect for a reading corner.' },
  { id: 'vase-1', name: 'Pale Celadon Vases', category: 'Accents', price: '$320', image: bay('12077', 960), description: 'Tall glazed vessels in soft celadon and dove grey.' },
  { id: 'vase-2', name: 'Lagoon Ceramic Vessels', category: 'Accents', price: '$185', image: bay('12223', 960), description: 'Round artisan ceramics in deep Gulf-green glazes.' },
  { id: 'console-1', name: 'Shagreen Three-Drawer Chest', category: 'Tables', price: '$2,400', image: bay('12009', 960), description: 'A textured ivory chest that works as a nightstand or a petite entry console.' },
  { id: 'console-2', name: 'Grasscloth Media Console', category: 'Tables', price: '$1,650', image: bay('12362', 960), description: 'Soft-blue grasscloth doors framed in pale oak, with room for media and storage.' },
  { id: 'cabinet-1', name: 'Oak & Brass Sideboard', category: 'Tables', price: '$3,200', image: bay('12622', 960), description: 'Grained oak sideboard with brass pulls, styled with sculptural accents.' },
  { id: 'lighting-1', name: 'Sculpted Spiral Table Lamp', category: 'Lighting', price: '$680', image: bay('12601', 960), description: 'A twisting ivory column under a generous linen shade.' },
  { id: 'accent-2', name: 'Gilded Bust & Inlay Boxes', category: 'Accents', price: '$540', image: bay('12276', 960), description: 'A curated vignette of gilded sculpture and bone-inlay boxes.' },
];

export const portfolioItems: PortfolioItem[] = [
  { id: 'p1', title: 'Palm Gallery Living Room', location: 'Naples, FL', image: bay('hdr-14'), category: 'Living Room' },
  { id: 'p2', title: 'Coastal Primary Suite', location: 'Naples, FL', image: bay('hdr-1'), category: 'Bedroom' },
  { id: 'p3', title: 'Coral Print Sitting Room', location: 'Naples, FL', image: bay('12454'), category: 'Living Room' },
  { id: 'p4', title: 'Open Great Room', location: 'Naples, FL', image: bay('hdr-11'), category: 'Living Room' },
  { id: 'p5', title: 'Upholstered Bed Suite', location: 'Naples, FL', image: bay('12171'), category: 'Bedroom' },
  { id: 'p6', title: 'Seaglass Console', location: 'Naples, FL', image: bay('12199'), category: 'Styling' },
  { id: 'p7', title: 'Bedside Lounge', location: 'Naples, FL', image: bay('12258'), category: 'Bedroom' },
  { id: 'p8', title: 'Grasscloth Console Wall', location: 'Naples, FL', image: bay('12226'), category: 'Styling' },
  { id: 'p9', title: 'Blue & White Bedroom', location: 'Naples, FL', image: bay('hdr-8'), category: 'Bedroom' },
  { id: 'p10', title: 'Palm Beach Console', location: 'Naples, FL', image: bay('12609'), category: 'Styling' },
  { id: 'p11', title: 'Linen Loveseat Corner', location: 'Naples, FL', image: bay('12607'), category: 'Living Room' },
  { id: 'p12', title: 'Primary Suite Lounge', location: 'Naples, FL', image: bay('hdr-12'), category: 'Bedroom' },
  { id: 'p13', title: 'Sculpted Lamp Vignette', location: 'Naples, FL', image: bay('12632'), category: 'Styling' },
  { id: 'p14', title: 'Gallery Living Room', location: 'Naples, FL', image: bay('hdr-15'), category: 'Living Room' },
];

export const services: Service[] = [
  {
    id: 'instant-design',
    title: 'Instant Design Program',
    description: 'Our exclusive complimentary service can help you furnish a room or home almost instantly. A designer meets you in your home to determine what pieces are needed to achieve a finished, designer-detailed look — from furniture and lighting to art and accessories.',
    icon: 'Sparkles',
    image: bay('hdr-15'),
    features: ['In-home consultation', 'Designer-curated selections', 'Expert installation & arrangement', 'Same-day delivery available'],
  },
  {
    id: 'full-service-design',
    title: 'Full-Service Interior Design',
    description: 'Our professionally trained designers help you find and select all the elements needed to furnish your home and create beautiful rooms that exceed your expectations.',
    icon: 'Home',
    image: bay('hdr-10'),
    features: ['Space planning', 'Color & fabric consultation', 'Custom furniture ordering', 'Complete room design'],
  },
  {
    id: 'white-glove',
    title: 'White Glove Delivery',
    description: 'Our delivery team is known for its prompt, courteous, and trustworthy service. They handle the most demanding deliveries and installations with care and understanding.',
    icon: 'Truck',
    image: bay('hdr-2'),
    features: ['Same-day delivery from showroom', 'Professional installation', 'Careful handling', 'Trusted & courteous team'],
  },
  {
    id: 'private-appointments',
    title: 'Private Appointments',
    description: 'To better serve our clients, we offer video and private appointments. Schedule a one-on-one session with our designers for personalized attention.',
    icon: 'Calendar',
    image: bay('hdr-7'),
    features: ['Video consultations', 'Private in-store sessions', 'Personalized attention', 'Flexible scheduling'],
  },
  {
    id: 'custom-order',
    title: 'Custom Furniture Orders',
    description: 'We stock many styles of sofas, chairs, consoles, cabinets, tables, fabrics and pillows, so you can experience our furniture before you buy or place a custom order.',
    icon: 'Armchair',
    image: bay('12083'),
    features: ['Experience before you buy', 'Custom upholstery options', 'Fabric & finish selection', 'Exclusive manufacturer lines'],
  },
  {
    id: 'art-gallery',
    title: 'Gallery-Quality Art',
    description: 'Susan’s superb eye for color and style shows in our rotating collection of unique accessories, original gallery-quality oil paintings and prints.',
    icon: 'Palette',
    image: bay('hdr-5'),
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
  bay('12002', 960),
  bay('12078', 960),
  bay('12594', 960),
  bay('12044', 960),
  bay('12089', 960),
  bay('12001', 960),
];

export const stats = [
  { label: 'Years in Business', value: 45, suffix: '+' },
  { label: 'Design Projects', value: 2000, suffix: '+' },
  { label: 'Happy Clients', value: 5000, suffix: '+' },
  { label: 'Showrooms in Naples', value: 2, suffix: '' },
];

export { blogPosts, type BlogPost } from './journal';

export const pageImages = {
  about: bay('hdr-14', 2400),
  aboutSecondary: bay('hdr-7', 2400),
  collections: bay('hdr-13', 2400),
  services: bay('hdr-15', 2400),
  portfolio: bay('hdr-12', 2400),
  journal: bay('hdr-2', 2400),
  contact: bay('hdr-6', 2400),
  cta: bay('hdr-14', 2400),
  sherrill: bay('12622'),
  intro1: bay('12414'),
  intro2: bay('12601', 960),
  downtown: bay('hdr-11', 960),
  warehouse: bay('hdr-12', 960),
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
