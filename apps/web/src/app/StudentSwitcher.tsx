import { useNavigate, useMatch } from "react-router";
import { Avatar } from "@astryxdesign/core/Avatar";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { useFamilyContext } from "./context.js";
import { hueStyle } from "../lib/colors.js";
import { Sheet } from "../ui/Sheet.js";

/** Pick a student. A BottomSheet on phones, a Dialog on desktop; the current kid is marked selected. */
export function StudentSwitcher({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const { students } = useFamilyContext();
  const navigate = useNavigate();
  const match = useMatch("/s/:studentId/*");
  const section = match?.params["*"] ?? "";
  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} label="Switch student" title="Students" height="hug">
      <List hasDividers density="spacious">
        {students.map((s) => (
          <ListItem
            key={s.id}
            label={s.firstName}
            description={`${gradeLabel(s.grade)} · ${s.school}`}
            isSelected={s.id === match?.params.studentId}
            startContent={<Avatar name={s.firstName} size="md" style={hueStyle(s.hue)} tooltip={false} />}
            onClick={() => {
              onOpenChange(false);
              navigate(`/s/${s.id}${section ? `/${section}` : ""}`);
            }}
          />
        ))}
      </List>
      {students.length === 0 && <Text type="supporting">No students yet — the collector adds them on its first run.</Text>}
    </Sheet>
  );
}


export function gradeLabel(grade: string): string {
  const n = Number(grade);
  if (!Number.isFinite(n)) return grade;
  if (n === 0) return "Kindergarten";
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix} grade`;
}
