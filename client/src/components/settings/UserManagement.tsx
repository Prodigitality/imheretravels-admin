"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/auth-store";
import type { User as UserType } from "@/types/users";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Shield,
  Calendar,
  MessageSquare,
  BarChart3,
  CreditCard,
  Search,
  RefreshCw,
  MapPin,
  Database,
  Settings,
  Mail,
  Copy,
  Eye,
  Send,
  UserPlus,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { staffFetch } from "@/lib/staff-fetch";
import { VIEWER_PERMISSIONS } from "@/lib/viewer-access";
import type { UserRole } from "@/types/users";

interface UserWithId extends UserType {
  id: string;
}

export default function UserManagement() {
  const { userProfile } = useAuthStore();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterApproval, setFilterApproval] = useState<string>("all");
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ email: string; firstName: string; lastName: string; role: "viewer" | "agent" }>({
    email: "",
    firstName: "",
    lastName: "",
    role: "viewer",
  });

  // Check if current user has permission to manage users
  const canManageUsers = userProfile?.permissions?.canManageUsers;
  // Roles and invites: admins only (firestore.rules, /api/users/invite).
  const isAdmin = userProfile?.role === "admin";
  const isInvited = (u: UserWithId) => !!u.invitedAt && u.hasAgreedToTerms === false;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, "users");
      const querySnapshot = await getDocs(usersRef);

      const usersData: UserWithId[] = [];
      querySnapshot.forEach((doc) => {
        const userData = {
          id: doc.id,
          ...doc.data(),
        } as UserWithId;

        // Exclude the current user and unfinished self sign-ups; invited
        // accounts show while they wait (with "Resend invite").
        if (
          userData.id !== userProfile?.id &&
          (userData.hasAgreedToTerms !== false || !!userData.invitedAt)
        ) {
          usersData.push(userData);
        }
      });

      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
  }, [canManageUsers, fetchUsers]);

  const updateUser = async (userId: string, updates: Partial<UserType>) => {
    try {
      setUpdatingUser(userId);
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        ...updates,
        metadata: {
          updatedAt: new Date() as unknown,
        },
      });

      // Update local state
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, ...updates } : user
        )
      );

      toast({
        title: "Success",
        description: "User updated successfully",
      });
    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setUpdatingUser(null);
    }
  };

  const toggleUserApproval = async (userId: string, isApproved: boolean) => {
    await updateUser(userId, { isApproved });
  };

  // Only admins may change a role (firestore.rules); a new viewer gets the
  // viewer's page flags (lib/viewer-access.ts). Leaving viewer keeps them, to
  // be adjusted with the switches.
  const changeRole = async (user: UserWithId, role: UserRole) => {
    if (role === user.role) return;
    await updateUser(user.id, role === "viewer" ? { role, permissions: VIEWER_PERMISSIONS } : { role });
  };

  const sendInvite = async (invite: { email: string; firstName: string; lastName: string; role: "viewer" | "agent" }) => {
    setInviting(true);
    try {
      const res = await staffFetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invite),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send the invite");
      toast({ title: "Invite sent", description: `${invite.email} will get an email to set their password.` });
      setInviteOpen(false);
      setInviteForm({ email: "", firstName: "", lastName: "", role: "viewer" });
      await fetchUsers();
      return true;
    } catch (error) {
      toast({
        title: "Couldn't send the invite",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      await fetchUsers();
      return false;
    } finally {
      setInviting(false);
    }
  };

  const togglePermission = async (
    userId: string,
    permission: keyof UserType["permissions"],
    value: boolean
  ) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const updatedPermissions = {
      ...user.permissions,
      [permission]: value,
    };

    await updateUser(userId, { permissions: updatedPermissions });
  };

  const filteredUsers = users.filter((user) => {
    // Exclude super admin
    if (user.email === "admin@imheretravels.com") {
      return false;
    }

    const matchesSearch =
      user.profile?.firstName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      user.profile?.lastName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = filterRole === "all" || user.role === filterRole;
    const matchesApproval =
      filterApproval === "all" ||
      (filterApproval === "approved" && user.isApproved) ||
      (filterApproval === "pending" && !user.isApproved);

    return matchesSearch && matchesRole && matchesApproval;
  });

  if (!canManageUsers) {
    return (
      <Card className="border border-royal-purple/20 dark:border-border shadow">
        <CardHeader className="bg-muted/50 border-b border-royal-purple/20 dark:border-border">
          <CardTitle className="flex items-center gap-2 text-crimson-red">
            <Shield className="h-5 w-5" />
            Access Denied
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            You don&apos;t have permission to manage users.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground font-hk-grotesk">
            User Management
          </h2>
          <p className="text-muted-foreground text-lg">
            Manage user accounts, permissions, and approval status
          </p>
        </div>
        <div className="flex space-x-2">
          {isAdmin && (
            <Button onClick={() => setInviteOpen(true)} className="bg-primary text-white hover:bg-primary/90">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite user
            </Button>
          )}
          <Button
            variant="outline"
            onClick={fetchUsers}
            disabled={loading}
            className="border-royal-purple/20 dark:border-border text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple transition-all duration-200"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-royal-purple/20 dark:border-border shadow">
        <CardHeader className="bg-muted/50 border-b border-royal-purple/20 dark:border-border">
          <CardTitle className="text-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search" className="text-foreground">
                Search Users
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-royal-purple/60" />
                <Input
                  id="search"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-royal-purple/20 dark:border-border focus:border-royal-purple focus:ring-royal-purple/20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-filter" className="text-foreground">
                Role
              </Label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="border-royal-purple/20 dark:border-border focus:border-royal-purple focus:ring-royal-purple/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-filter" className="text-foreground">
                Approval Status
              </Label>
              <Select value={filterApproval} onValueChange={setFilterApproval}>
                <SelectTrigger className="border-royal-purple/20 dark:border-border focus:border-royal-purple focus:ring-royal-purple/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Badge
                variant="secondary"
                className="text-sm bg-royal-purple/20 text-royal-purple border border-royal-purple/30"
              >
                {filteredUsers.length} users
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border border-royal-purple/20 dark:border-border shadow">
        <CardHeader className="bg-muted/50 border-b border-royal-purple/20 dark:border-border">
          <CardTitle className="text-foreground">Users</CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage user permissions and approval status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-royal-purple" />
              <span className="ml-2 text-muted-foreground">
                Loading users...
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-royal-purple/20 dark:border-border">
                    <TableHead className="text-foreground">User</TableHead>
                    <TableHead className="text-foreground">Role</TableHead>
                    <TableHead className="text-foreground">Approved</TableHead>
                    <TableHead className="text-foreground">
                      Permissions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className="border-b border-royal-purple/20 dark:border-border transition-colors duration-200 hover:bg-royal-purple/5"
                    >
                      <TableCell className="py-4">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.profile?.avatar} />
                            <AvatarFallback className="bg-royal-purple/20 text-royal-purple">
                              {user.profile?.firstName?.[0]}
                              {user.profile?.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-foreground">
                              {user.profile?.firstName} {user.profile?.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {isAdmin ? (
                          <Select
                            value={user.role}
                            onValueChange={(v) => void changeRole(user, v as UserRole)}
                            disabled={updatingUser === user.id}
                          >
                            <SelectTrigger className="w-28" aria-label={`Role of ${user.email}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={
                              user.role === "admin" ? "destructive" : "secondary"
                            }
                            className={
                              user.role === "admin"
                                ? "bg-crimson-red/20 text-crimson-red border border-crimson-red/30"
                                : "bg-royal-purple/20 text-royal-purple border border-royal-purple/30"
                            }
                          >
                            {user.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={user.isApproved}
                            onCheckedChange={(checked) =>
                              toggleUserApproval(user.id, checked)
                            }
                            disabled={updatingUser === user.id}
                          />
                          <Label className="text-sm text-foreground">
                            {user.isApproved ? "Approved" : "Pending"}
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-3">
                          {!user.isApproved && (
                            <div className="mb-2 p-2 bg-sunglow-yellow/20 border border-sunglow-yellow/30 rounded-md">
                              <p className="text-xs text-vivid-orange font-medium">
                                User not approved - All permissions disabled
                              </p>
                            </div>
                          )}

                          {isInvited(user) && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-royal-purple/20 bg-royal-purple/5 p-2">
                              <p className="text-xs text-foreground">
                                Invited: waiting for them to set a password and finish sign-up.
                              </p>
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={inviting}
                                  onClick={() =>
                                    void sendInvite({
                                      email: user.email,
                                      firstName: user.profile?.firstName ?? "",
                                      lastName: user.profile?.lastName ?? "",
                                      role: user.role === "agent" ? "agent" : "viewer",
                                    })
                                  }
                                >
                                  <Send className="mr-1 h-3 w-3" /> Resend invite
                                </Button>
                              )}
                            </div>
                          )}

                          {user.role === "viewer" ? (
                            <div className="flex items-start gap-2 rounded-md border border-royal-purple/20 bg-muted/30 p-3">
                              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-royal-purple" />
                              <p className="text-xs text-foreground">
                                <span className="font-medium">Read-only.</span> Can view Bookings, Tour Packages
                                (including the sale&apos;s slot tracker), Enquiries and Transactions. Can&apos;t change
                                anything. Change the role to give edit rights.
                              </p>
                            </div>
                          ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {/* Bookings Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Calendar className="h-4 w-4 text-royal-purple" />
                                <Label className="text-xs font-medium text-foreground">
                                  Bookings
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageBookings
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageBookings",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Tours Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <MapPin className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  Tour Packages
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageTours
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageTours",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Communications Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <MessageSquare className="h-4 w-4 text-royal-purple" />
                                <Label className="text-xs font-medium text-foreground">
                                  Email Templates
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageTemplates
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageTemplates",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Payment Types Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <CreditCard className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  Payment Types
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManagePaymentTypes
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManagePaymentTypes",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Storage Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Database className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  Storage
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageStorage
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageStorage",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Functions Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Settings className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  Functions
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageFunctions
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageFunctions",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* Email Management Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Mail className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  Email Management
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageEmails
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageEmails",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* User Management Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Users className="h-4 w-4 text-crimson-red" />
                                <Label className="text-xs font-medium text-foreground">
                                  User Management
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageUsers
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageUsers",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>

                            {/* BCC Management Permission */}
                            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border border-royal-purple/20 dark:border-border">
                              <div className="flex items-center space-x-2">
                                <Copy className="h-4 w-4 text-spring-green" />
                                <Label className="text-xs font-medium text-foreground">
                                  BCC Management
                                </Label>
                              </div>
                              <Switch
                                checked={
                                  user.isApproved
                                    ? user.permissions.canManageBcc
                                    : false
                                }
                                onCheckedChange={(checked) =>
                                  togglePermission(
                                    user.id,
                                    "canManageBcc",
                                    checked
                                  )
                                }
                                disabled={
                                  !user.isApproved || updatingUser === user.id
                                }
                              />
                            </div>
                          </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              We email them a link to choose their own password. They then finish sign-up (name and terms) and can sign
              in straight away: the account is already approved with the role you pick.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendInvite({ ...inviteForm, email: inviteForm.email.trim() });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="name@imheretravels.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-first">First name</Label>
                <Input id="invite-first" value={inviteForm.firstName} onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-last">Last name</Label>
                <Input id="invite-last" value={inviteForm.lastName} onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v as "viewer" | "agent" }))}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (read-only: Bookings, Tour Packages, Enquiries, Transactions)</SelectItem>
                  <SelectItem value="agent">Agent (switch on what they can manage after)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={inviting} onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !inviteForm.email.trim()}>
                {inviting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
