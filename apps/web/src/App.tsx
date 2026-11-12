import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/auth-context'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar/Navbar'
import Home from './pages/home/Home'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './pages/dashboard/Dashboard'
import BuyCredits from './pages/buyCredits/BuyCredits'
import Return from './pages/return/Return'
import { createQueryClient } from './lib/query-client'
import './styles.css'

const queryClient = createQueryClient()

function AppContent() {
  const { user } = useAuth()

  return (
    <div className="app-wrapper">
      {user && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/buy-credits" element={<BuyCredits />} />
          <Route path="/return" element={<Return />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
