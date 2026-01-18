"use client";

import { useRouter } from "next/navigation";
import MemberManagement from "@/components/MemberManagement";

type Member = {
  id: string;
  role: string;
  userId: string;
  user: {
    id: string;
    familyName: string | null;
    givenName: string | null;
    email: string;
  };
};

type MemberManagementWrapperProps = {
  organizationId: string;
  members: Member[];
  userRole?: string;
  currentUserId: string;
};

export default function MemberManagementWrapper({
  organizationId,
  members,
  userRole,
  currentUserId,
}: MemberManagementWrapperProps) {
  const router = useRouter();

  const handleUpdate = () => {
    router.refresh();
  };

  return (
    <MemberManagement
      organizationId={organizationId}
      members={members}
      userRole={userRole || ""}
      currentUserId={currentUserId}
      onUpdate={handleUpdate}
    />
  );
}
