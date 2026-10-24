import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { LandingPage } from '../pages/LandingPage';
import { MeetingsPage } from '../pages/MeetingsPage';
import { NewMeetingPage } from '../pages/NewMeetingPage';
import { MeetingDetailPage } from '../pages/MeetingDetailPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MembersPage } from '../pages/MembersPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Landing page — no layout wrapper */}
      <Route path="/" element={<LandingPage />} />

      {/* App pages — inside sidebar layout */}
      <Route element={<AppLayout />}>
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/new" element={<NewMeetingPage />} />
        <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/members" element={<MembersPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
