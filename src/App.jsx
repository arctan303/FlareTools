import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, Suspense, lazy } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Skeleton from './components/ui/Skeleton'
import AnimatedRoutes from './components/AnimatedRoutes'

const Home = lazy(() => import('./pages/Home'))
const About = lazy(() => import('./pages/About'))
const DataTransformer = lazy(() => import('./pages/dev/DataTransformer'))
const StringProcessor = lazy(() => import('./pages/dev/StringProcessor'))
const GeneratorHub = lazy(() => import('./pages/dev/GeneratorHub'))
const Color = lazy(() => import('./pages/dev/Color'))
const Timestamp = lazy(() => import('./pages/dev/Timestamp'))
const Jwt = lazy(() => import('./pages/security/Jwt'))
const Markdown = lazy(() => import('./pages/text/Markdown'))
const Diff = lazy(() => import('./pages/text/Diff'))
const Qrcode = lazy(() => import('./pages/tools/Qrcode'))
const TextShare = lazy(() => import('./pages/share/TextShare'))
const NotFound = lazy(() => import('./pages/NotFound'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <I18nProvider>
          <Layout>
            <ErrorBoundary>
              <ScrollToTop />
              <AnimatedRoutes>
                <Suspense fallback={<Skeleton />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/dev/transformer" element={<DataTransformer />} />
                    <Route path="/dev/string" element={<StringProcessor />} />
                    <Route path="/dev/generator" element={<GeneratorHub />} />
                    <Route path="/dev/color" element={<Color />} />
                    <Route path="/dev/timestamp" element={<Timestamp />} />
                    <Route path="/security/jwt" element={<Jwt />} />
                    <Route path="/text/markdown" element={<Markdown />} />
                    <Route path="/text/diff" element={<Diff />} />
                    <Route path="/tools/qrcode" element={<Qrcode />} />
                    <Route path="/share/text" element={<TextShare />} />
                    <Route path="/share/file" element={<TextShare />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AnimatedRoutes>
            </ErrorBoundary>
          </Layout>
        </I18nProvider>
      </ThemeProvider>
    </HelmetProvider>
  )
}

export default App
