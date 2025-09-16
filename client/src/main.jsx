// client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import App from './App.jsx'; // This is the chat app
import AdminPage from './AdminPage.jsx'; // This is the new admin page

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // Your main chat application is at the root
  },
  {
    path: "/admin",
    element: <AdminPage />, // Your admin page is at /admin
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);