# EcoFlow Delta 2 Dashboard

A modern, real-time dashboard for monitoring and managing EcoFlow Delta 2 power stations. Built with Next.js 14, Chakra UI, and integrated with the EcoFlow Developer API.

![Dashboard Preview](https://via.placeholder.com/800x400/000000/44af21?text=EcoFlow+Dashboard+Preview)

## 🚀 Features

### 📊 Real-time Monitoring
- Live battery status and capacity tracking
- Power input/output monitoring
- Temperature readings and alerts
- Device status indicators

### 📈 Analytics & Insights
- Historical data visualization
- Energy consumption trends
- Efficiency metrics and reporting
- Comparative analytics

### 🎛️ Device Management
- Remote device control (where supported)
- Settings configuration
- Firmware information
- Multi-device support

### 🎨 Modern UI/UX
- Dark theme interface
- Responsive design (mobile, tablet, desktop)
- Smooth GSAP animations
- Real-time data updates

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI Library**: Chakra UI v2
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Forms**: Formik + Yup validation
- **Animations**: GSAP
- **Icons**: Lucide React
- **Charts**: Recharts

### Backend
- **API Routes**: Next.js API routes
- **Database**: Supabase (PostgreSQL)
- **ORM**: Prisma
- **Authentication**: NextAuth.js / Supabase Auth

### External Services
- **EcoFlow API**: Official Developer API
- **Hosting**: Vercel
- **Database**: Supabase (Free tier)

## 🎨 Design System

### Color Palette
- **Primary Black**: `#000000`
- **Secondary Dark**: `#2b2b2b`
- **Green Primary**: `#44af21`
- **Green Secondary**: `#00c356`
- **Green Accent**: `#00e16e`
- **Light Gray**: `#ebebeb`
- **Blue Accent**: `#3a6fe3`

## 📋 Prerequisites

Before you begin, ensure you have the following:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **EcoFlow Developer Account** with API credentials
- **Supabase Account** (free tier available)
- **Git** for version control

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd my-ecoflow
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Setup

Create a `.env.local` file in the root directory:

```env
# EcoFlow API Credentials
ECOFLOW_ACCESS_KEY=your_access_key_here
ECOFLOW_SECRET_KEY=your_secret_key_here

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# NextAuth Configuration
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000

# Database
DATABASE_URL=your_supabase_database_url
```

### 4. Database Setup

Initialize the database schema:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 📁 Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── devices/           # Device management pages
│   │   └── analytics/         # Analytics pages
│   ├── components/            # Reusable components
│   │   ├── ui/               # Base UI components
│   │   ├── forms/            # Form components
│   │   ├── charts/           # Chart components
│   │   └── layout/           # Layout components
│   ├── lib/                  # Utility functions
│   │   ├── ecoflow-api.ts    # EcoFlow API wrapper
│   │   ├── supabase.ts       # Supabase client
│   │   └── utils.ts          # General utilities
│   ├── stores/               # Zustand stores
│   ├── types/                # TypeScript definitions
│   └── styles/               # Global styles
├── prisma/                   # Database schema
├── public/                   # Static assets
└── docs/                     # Documentation
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server

# Database
npm run db:migrate   # Run database migrations
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run type-check   # Run TypeScript checks
```

### Code Style

This project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety
- **Husky** for git hooks (planned)

## 🔌 API Integration

### EcoFlow API

The dashboard integrates with the EcoFlow Developer API to fetch real-time device data. Supported endpoints include:

- Device listing and status
- Real-time power metrics
- Historical data retrieval
- Device control functions (where available)

### Rate Limiting

The API implements intelligent rate limiting and caching to ensure optimal performance while respecting EcoFlow's API limits.

## 🚀 Deployment

### Vercel Deployment

1. **Connect to Vercel**
   ```bash
   npx vercel
   ```

2. **Configure Environment Variables**
   Add all environment variables in the Vercel dashboard

3. **Deploy**
   ```bash
   npx vercel --prod
   ```

### Environment Variables for Production

Ensure all environment variables are properly configured in your deployment platform:

- `ECOFLOW_ACCESS_KEY`
- `ECOFLOW_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`

## 📊 Monitoring

### Performance Monitoring
- Vercel Analytics for performance insights
- Real-time error tracking
- API response time monitoring

### Database Monitoring
- Supabase dashboard for database metrics
- Query performance tracking
- Storage usage monitoring

## 🔒 Security

### Best Practices
- Environment variables for sensitive data
- API key encryption and secure storage
- Input validation and sanitization
- Rate limiting and CORS protection

### Authentication
- Secure session management
- Protected API routes
- Role-based access control (planned)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the established code style and patterns
- Write comprehensive tests for new features
- Update documentation for any API changes
- Ensure responsive design principles

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **EcoFlow** for providing the Developer API
- **Vercel** for hosting and deployment platform
- **Supabase** for backend services
- **Chakra UI** for the component library

## 📞 Support

For support and questions:

1. Check the [Documentation](./docs/)
2. Review [Common Issues](./docs/troubleshooting.md)
3. Open an [Issue](../../issues)

## 🗺️ Roadmap

### Phase 1 (Current)
- [x] Project planning and setup
- [ ] Basic authentication system
- [ ] EcoFlow API integration
- [ ] Dashboard home page

### Phase 2 (Next)
- [ ] Device management interface
- [ ] Real-time data visualization
- [ ] Historical analytics

### Phase 3 (Future)
- [ ] Mobile app companion
- [ ] Advanced analytics and ML insights
- [ ] Multi-device support
- [ ] Smart home integration

---

**Built with ❤️ for the EcoFlow community**