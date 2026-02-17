"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, LogOut, Settings, LayoutDashboard, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const UserNav = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, is_admin')
          .eq('id', user.id)
          .single();
        if (data) setProfile(data);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      showSuccess("A presto!");
      navigate('/login');
    } catch (error: any) {
      showError(error.message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-11 w-11 rounded-full border border-gray-100 shadow-sm hover:shadow-md transition-premium active:scale-95 p-0 bg-white">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
              {profile?.full_name?.charAt(0).toUpperCase() || email.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 rounded-2xl p-2 shadow-airbnb border-none mt-2" align="end" forceMount>
        <DropdownMenuLabel className="font-normal px-4 py-3">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-bold leading-none text-gray-900">{profile?.full_name || 'Socio'}</p>
            <p className="text-xs leading-none text-gray-400">{email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-50 mx-2" />
        <DropdownMenuGroup className="p-1">
          <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-gray-50">
            <Link to="/profile">
              <User className="mr-3 h-4 w-4 text-gray-400" />
              <span className="font-medium">Profilo</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-gray-50">
            <Link to="/dashboard">
              <LayoutDashboard className="mr-3 h-4 w-4 text-gray-400" />
              <span className="font-medium">Dashboard</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-gray-50">
            <Link to="/history">
              <History className="mr-3 h-4 w-4 text-gray-400" />
              <span className="font-medium">I miei campi</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-gray-50 mx-2" />
        {profile?.is_admin && (
          <div className="p-1">
            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 focus:bg-gray-50 text-club-orange">
              <Link to="/admin">
                <Settings className="mr-3 h-4 w-4" />
                <span className="font-bold">Pannello Admin</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-50 mx-2" />
          </div>
        )}
        <div className="p-1">
          <DropdownMenuItem onClick={handleLogout} className="rounded-xl cursor-pointer py-2.5 text-red-600 focus:text-red-700 focus:bg-red-50">
            <LogOut className="mr-3 h-4 w-4" />
            <span className="font-bold">Esci</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserNav;