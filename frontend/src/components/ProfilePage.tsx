import { useState } from 'react';
import { User, Mail, Save } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Avatar, AvatarFallback } from './ui/avatar';
import type { UserProfile } from '../App';

type ProfilePageProps = {
  userProfile: UserProfile;
  saveUserProfile: (profile: UserProfile) => void;
};

export function ProfilePage({ userProfile, saveUserProfile }: ProfilePageProps) {
  const [name, setName] = useState(userProfile.name);
  const [email, setEmail] = useState(userProfile.email);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    saveUserProfile({ name, email });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FAF8F4]">
      <div className="border-b border-[#D5CBBE] bg-white p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl text-[#2F342E]">Profile Settings</h1>
          <p className="text-[#5A625A] mt-1">
            Manage your account information
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6 mb-8 pb-8 border-b border-[#D5CBBE]">
              <Avatar className="w-24 h-24 bg-[#C7D6C1] text-[#546F54]">
                <AvatarFallback className="text-2xl bg-[#C7D6C1] text-[#546F54]">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl mb-1 text-[#2F342E]">{name}</h2>
                <p className="text-[#5A625A]">{email}</p>
              </div>
            </div>

            {/* Profile Form */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AABCA3]" />
                  <Input
                    id="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="pl-10"
                    placeholder="Your name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AABCA3]" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="your.email@example.com"
                  />
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={handleSave}
                  className="w-full sm:w-auto"
                  disabled={isSaved}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>

          {/* Additional Settings */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6 mt-6">
            <h3 className="mb-4 text-[#2F342E]">Account Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-[#E8F0E6] rounded-lg border border-[#D5CBBE]">
                <div className="text-2xl mb-1 text-[#2F342E]">-</div>
                <div className="text-sm text-[#5A625A]">
                  Total Videos
                </div>
              </div>
              <div className="p-4 bg-[#E8F0E6] rounded-lg border border-[#D5CBBE]">
                <div className="text-2xl mb-1 text-[#2F342E]">-</div>
                <div className="text-sm text-[#5A625A]">
                  Total Chats
                </div>
              </div>
              <div className="p-4 bg-[#E8F0E6] rounded-lg border border-[#D5CBBE]">
                <div className="text-2xl mb-1 text-[#2F342E]">-</div>
                <div className="text-sm text-[#5A625A]">
                  Folders Created
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
