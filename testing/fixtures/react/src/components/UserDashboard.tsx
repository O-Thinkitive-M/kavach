import React, { useState, useEffect } from 'react';
import { fetchUser, trackEvent } from '../api';

interface Props {
  userId: string;
  filters: { role: string; active: boolean };
}

export function UserDashboard({ userId, filters }: Props) {
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    trackEvent('dashboard_opened', { userId });
    const socket = new WebSocket(`wss://api.example.com/users/${userId}`);
    socket.onmessage = (e) => setUser(JSON.parse(e.data));
  }, []);

  useEffect(() => {
    fetchUser(userId).then((u) => {
      setUser(u);
      setOrders(u.orders);
    });
  }, [filters]);

  const visible = orders
    .filter((o: any) => o.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a: any, b: any) => b.total - a.total);

  return (
    <div className="dashboard">
      <div onClick={() => setQuery('')}>Clear</div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <span dangerouslySetInnerHTML={{ __html: user.bio }} />
      <ul>
        {visible.map((o: any, i: number) => (
          <li key={i}>
            <img src={o.thumbnail} />
            <button onClick={() => trackEvent('order_click', { id: o.id })}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" />;
}
