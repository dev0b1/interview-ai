/* eslint-disable react/no-unescaped-entities */
"use client";

import Link from 'next/link';
import { motion } from 'framer-motion';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-semibold text-gray-900">InterviewAI</div>
          <div className="flex items-center gap-6">
            <Link href="/auth" className="text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/interview" className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-20 pb-24">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Ace your next interview with AI-powered practice
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              Practice real-time voice interviews, get instant feedback on your performance, and track your improvement over time. Build confidence before the interview that matters.
            </p>
            <div className="flex items-center gap-4">
              <Link 
                href="/interview" 
                className="px-8 py-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Start practicing for free
              </Link>
              <Link 
                href="#demo" 
                className="px-8 py-4 text-gray-700 font-medium hover:text-gray-900"
              >
                See how it works →
              </Link>
            </div>
            <p className="text-sm text-gray-500 mt-6">No credit card required • Unlimited practice sessions</p>
          </motion.div>
        </section>

        {/* Stats Section */}
        <section className="border-y border-gray-200 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="grid grid-cols-3 gap-12">
              <div>
                <div className="text-4xl font-bold text-gray-900 mb-2">12,000+</div>
                <div className="text-gray-600">Practice interviews completed</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-gray-900 mb-2">89%</div>
                <div className="text-gray-600">Users report improved confidence</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-gray-900 mb-2">4.8/5</div>
                <div className="text-gray-600">Average user rating</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-7xl mx-auto px-6 py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-16">Everything you need to prepare</h2>
            
            <div className="grid grid-cols-2 gap-16">
              <div>
                <div className="w-12 h-12 bg-gray-900 rounded-lg mb-6"></div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Real-time voice interviews</h3>
                <p className="text-gray-600 leading-relaxed">
                  Practice with an AI interviewer that conducts natural conversations. Answer questions out loud and get follow-ups based on your responses, just like a real interview.
                </p>
              </div>

              <div>
                <div className="w-12 h-12 bg-gray-900 rounded-lg mb-6"></div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Instant performance analysis</h3>
                <p className="text-gray-600 leading-relaxed">
                  Get detailed feedback immediately after each interview. See your confidence score, speaking pace, filler word usage, and receive personalized tips to improve.
                </p>
              </div>

              <div>
                <div className="w-12 h-12 bg-gray-900 rounded-lg mb-6"></div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Interview transcripts</h3>
                <p className="text-gray-600 leading-relaxed">
                  Review full transcripts of every interview. Analyze your answers, identify patterns in your responses, and refine your talking points for real interviews.
                </p>
              </div>

              <div>
                <div className="w-12 h-12 bg-gray-900 rounded-lg mb-6"></div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Progress tracking</h3>
                <p className="text-gray-600 leading-relaxed">
                  Track your improvement across multiple practice sessions. See how your confidence and clarity scores increase as you practice more.
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* How it works */}
        <section className="bg-gray-900 text-white py-24">
          <div className="max-w-7xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-bold mb-6">How it works</h2>
              <p className="text-xl text-gray-400 mb-16 max-w-2xl">
                Get interview-ready in minutes, not weeks
              </p>

              <div className="grid grid-cols-3 gap-12">
                <div>
                  <div className="text-6xl font-bold text-gray-700 mb-6">01</div>
                  <h3 className="text-xl font-semibold mb-3">Choose your role</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Select the type of role you're interviewing for—software engineering, product management, consulting, or general behavioral questions.
                  </p>
                </div>

                <div>
                  <div className="text-6xl font-bold text-gray-700 mb-6">02</div>
                  <h3 className="text-xl font-semibold mb-3">Start the interview</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Click record and begin speaking. The AI interviewer will ask questions and respond naturally to your answers in real-time.
                  </p>
                </div>

                <div>
                  <div className="text-6xl font-bold text-gray-700 mb-6">03</div>
                  <h3 className="text-xl font-semibold mb-3">Get feedback</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Review your performance, read the transcript, and see actionable insights to improve for your next practice session.
                  </p>
                </div>
              </div>

              <div className="mt-16">
                <Link 
                  href="/interview" 
                  className="inline-block px-8 py-4 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Try it now
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="max-w-7xl mx-auto px-6 py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-16">What people are saying</h2>
            
            <div className="grid grid-cols-3 gap-8">
              <div className="border border-gray-200 rounded-lg p-8">
                <p className="text-gray-700 mb-6 leading-relaxed">
                  "Practicing out loud made such a difference. I felt way more prepared and confident going into my real interviews."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                  <div>
                    <div className="font-medium text-gray-900">Sarah Chen</div>
                    <div className="text-sm text-gray-500">Software Engineer</div>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-8">
                <p className="text-gray-700 mb-6 leading-relaxed">
                  "The feedback on filler words was eye-opening. I had no idea I said 'um' that much until I saw the data."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                  <div>
                    <div className="font-medium text-gray-900">Michael Torres</div>
                    <div className="text-sm text-gray-500">Product Manager</div>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-8">
                <p className="text-gray-700 mb-6 leading-relaxed">
                  "Being able to practice anytime without scheduling with another person was a game changer for my prep."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                  <div>
                    <div className="font-medium text-gray-900">Priya Patel</div>
                    <div className="text-sm text-gray-500">Consultant</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-gray-200 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 py-24 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-5xl font-bold text-gray-900 mb-6">
                Start practicing today
              </h2>
              <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
                Join thousands of job seekers who are using AI to prepare for their interviews and land their dream jobs.
              </p>
              <Link 
                href="/interview" 
                className="inline-block px-8 py-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Start your first interview
              </Link>
              <p className="text-sm text-gray-500 mt-6">Free to start • No credit card required</p>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between">
              <div className="text-gray-600">© 2025 InterviewAI. All rights reserved.</div>
              <div className="flex items-center gap-8">
                <Link href="/privacy" className="text-gray-600 hover:text-gray-900">Privacy</Link>
                <Link href="/terms" className="text-gray-600 hover:text-gray-900">Terms</Link>
                <Link href="/contact" className="text-gray-600 hover:text-gray-900">Contact</Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
