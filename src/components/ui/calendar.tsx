import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-4 w-full", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
        month: "space-y-6 w-full",
        caption: "flex justify-center pt-2 pb-4 relative items-center border-b border-gray-100",
        caption_label: "text-xl font-semibold text-primary capitalize",
        nav: "space-x-2 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-10 w-10 bg-white p-0 hover:bg-primary hover:text-white transition-colors duration-200 border-gray-200",
        ),
        nav_button_previous: "absolute left-2",
        nav_button_next: "absolute right-2",
        table: "w-full border-collapse",
        head_row: "flex mb-2 justify-between",
        head_cell:
          "text-primary/70 rounded-md flex-1 h-12 font-semibold text-sm flex items-center justify-center uppercase tracking-wide",
        row: "flex w-full justify-between",
        cell: cn(
          "relative flex-1 aspect-square text-center text-sm p-1",
          "focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-primary/10 [&:has([aria-selected])]:rounded-lg",
          "[&:has([aria-selected].day-outside)]:bg-primary/5",
          "[&:has([aria-selected].day-range-end)]:rounded-r-lg",
          "first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-full w-full p-0 font-medium text-base hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-lg",
          "aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-white hover:bg-primary hover:text-white focus:bg-primary focus:text-white shadow-md",
        day_today: "bg-accent text-accent-foreground font-bold ring-2 ring-primary/30",
        day_outside:
          "day-outside text-muted-foreground/40 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground/30 cursor-not-allowed",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-5 w-5" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-5 w-5" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };