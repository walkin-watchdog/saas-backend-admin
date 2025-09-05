import { formatDate, parse } from "date-fns";
import { PriceDisplay } from "../common/PriceDisplay";
import { Link } from "react-router-dom";
import {
  X,
  Users,
  Heart,
  Calendar as CalendarIcon,
  Plus,
  Minus,
} from "lucide-react";
import { Sheet } from "react-modal-sheet";
import clsx from "clsx";
import { useState, useEffect, useRef, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { Pricing } from "./pricing";
import { generateWeeklyRandomNumber } from "@/utils/dynamicRating";
import { getOptimalCurrencyForProduct, setCurrencyAndNotify } from "@/utils/currencyUtils";

interface BookingSidebarProps {
  cheapestPackage: any;
  currentProduct: any;
  selectedDateStr: string;
  adultsCount: number;
  childrenCount: number;
  isMobile: boolean;
  setCheckingAvail: (checking: boolean) => void;
  setIsDateOk: (ok: boolean) => void;
  setAvailablePackages: (pkgs: any[]) => void;
  setSelectedSlotId: (id: string | null) => void;
  setSelectedTimeSlot: (time: string | null) => void;
  calculateEffectivePrice: (
    basePrice: number,
    discountType?: string,
    discountValue?: number
  ) => number;
  handleBarChange: (params: {
    date: string;
    adults: number;
    children: number;
  }) => void;
  selectedPackage: any;
  checkingAvail: boolean;
  isDateOk: boolean | null;
  availablePackages: any[];
  slotsLoading: boolean;
  slotsForPackage: any[];
  selectedSlot: any;
  selectedSlotId: string | null;
  selectedTimeSlot: string | null;
  handlePackageSelect: (pkgId: string) => void;
  setSelectedSlot: (slot: any) => void;
  isSlotBookable: (
    date: string,
    time: string,
    cutoffTime: number
  ) => { isBookable: boolean; reason?: string };
  onDateStatusChange?: (status: 'AVAILABLE'|'SOLD_OUT'|'NOT_OPERATING') => void;
}

export const BookingSidebar = ({
  cheapestPackage,
  currentProduct,
  selectedDateStr,
  adultsCount,
  childrenCount,
  isMobile,
  setCheckingAvail,
  setIsDateOk,
  setAvailablePackages,
  setSelectedSlotId,
  setSelectedTimeSlot,
  calculateEffectivePrice,
  handleBarChange,
  selectedPackage,
  checkingAvail,
  isDateOk,
  availablePackages,
  slotsLoading,
  slotsForPackage,
  selectedSlot,
  selectedSlotId,
  selectedTimeSlot,
  handlePackageSelect,
  setSelectedSlot,
  isSlotBookable,
  onDateStatusChange,
}: BookingSidebarProps) => {
  const [showAvailabilityPopup, setShowAvailabilityPopup] = useState(false);
  const [showAllTimeSlots, setShowAllTimeSlots] = useState(false);
  const [showDatepicker, setShowDatepicker] = useState(false);
  const [showTravellers, setShowTravellers] = useState(false);
  const datepickerRef = useRef<HTMLDivElement>(null);
  const travellersRef = useRef<HTMLDivElement>(null);
  const [tempAdults, setTempAdults] = useState(adultsCount);
  const [tempChildren, setTempChildren] = useState(childrenCount);
  const [expandedPkgDesc, setExpandedPkgDesc] = useState<string | null>(null);
  const DESC_LIMIT = 120;
  const productCap           = currentProduct.capacity ?? Infinity;
  const selectedPkgCap       = selectedPackage?.maxPeople ?? Infinity;
  const maxCapForPicker      = Math.min(productCap, selectedPkgCap);
  const totalTravellersLive  = tempAdults + tempChildren;
  const totalTravellersFixed = adultsCount + childrenCount;
  const capacityExceededLive = totalTravellersLive >= maxCapForPicker;
  const capTooltip           = selectedPackage
    ? "Package capacity exceeded"
    : "Product capacity exceeded";
  const packagesToShow = useMemo(
    () =>
      availablePackages.filter(
        (p) => (p.maxPeople ?? productCap) >= totalTravellersFixed
      ),
    [availablePackages, productCap, totalTravellersFixed]
  );
  const weeklyRecommendPercent = generateWeeklyRandomNumber(currentProduct?.id);

  const isChildAllowed = useMemo(() => {
    if (selectedPackage?.ageGroups?.child) {
      return selectedPackage.ageGroups.child.enabled !== false;
    }
    return true;
  }, [selectedPackage]);

    useEffect(() => {
        setTempAdults(adultsCount);
        setTempChildren(childrenCount);
    }, [adultsCount, childrenCount]);

    useEffect(() => {
      if (availablePackages && availablePackages.length > 0) {
        const optimalCurrency = getOptimalCurrencyForProduct(availablePackages);
        const currentCurrency = localStorage.getItem('preferredCurrency') || 'INR';
        
        if (optimalCurrency !== currentCurrency) {
            console.log(`Updating currency to ${optimalCurrency} based on available packages`);
            setCurrencyAndNotify(optimalCurrency);
        }
      }
    }, [availablePackages]);

  
    useEffect(() => {
      if (!isMobile && showDatepicker) {
        const handleClickOutside = (e: MouseEvent) => {
          if (datepickerRef.current && !datepickerRef.current.contains(e.target as Node)) {
            setShowDatepicker(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isMobile, showDatepicker]);
  
    useEffect(() => {
      if (!isMobile && showTravellers) {
        const handleClickOutside = (e: MouseEvent) => {
          if (travellersRef.current && !travellersRef.current.contains(e.target as Node)) {
            setShowTravellers(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isMobile, showTravellers]);

  const refetchAvailability = async () => {
    const iso = formatDate(
      parse(selectedDateStr, "MM/dd/yyyy", new Date()),
      "yyyy-MM-dd"
    );

    setCheckingAvail(true);
    try {
      // 1. Fetch fresh product (with our new availability fields)
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/products/${currentProduct.id}`
      );
      const prod = await res.json();

      // 2. Check blockedDates first (unchanged logic)
      const isBlocked = prod.blockedDates?.some((b: any) =>
        !b.isActive && b.date.slice(0,10) === iso
      );
      if (isBlocked) {
        setIsDateOk(false);
        setAvailablePackages([]);
        return;
      }

      // 3. Compute date‐level status
      let dayStatus: 'AVAILABLE'|'SOLD_OUT'|'NOT_OPERATING' = 'AVAILABLE';

      // permanent override?
      if (prod.permanentAvailabilityStatus) {
        dayStatus = prod.permanentAvailabilityStatus;
      } if (dayStatus !== 'AVAILABLE') {
        setIsDateOk(false);
        setAvailablePackages([]);
      } else {
        const today = new Date(iso);
        const start = new Date(prod.availabilityStartDate);
        const end = prod.availabilityEndDate ? new Date(prod.availabilityEndDate) : null;
        if (today < start || (end && today > end)) {
          dayStatus = 'NOT_OPERATING';
        } else {
          // check subranges
          const inSold = prod.availabilitySubranges.some((r: any) =>
            r.status === 'SOLD_OUT' &&
            today >= new Date(r.startDate) &&
            today <= new Date(r.endDate)
          );
          const inNotOp = prod.availabilitySubranges.some((r: any) =>
            r.status === 'NOT_OPERATING' &&
            today >= new Date(r.startDate) &&
            today <= new Date(r.endDate)
          );
          dayStatus = inSold ? 'SOLD_OUT' : inNotOp ? 'NOT_OPERATING' : 'AVAILABLE';
        }
      }

      if (dayStatus !== 'AVAILABLE') {
        setIsDateOk(false);
        setAvailablePackages([]);
      } else {
        // 4. If Available, show all active packages
        setIsDateOk(true);
        setAvailablePackages(prod.packages || []);
        // auto-select first fitting package
        const first = (prod.packages||[]).find(
          (p: any) => (p.maxPeople ?? productCap) >= adultsCount + childrenCount
        );
        if (first) handlePackageSelect(first.id);
      }
      if (onDateStatusChange) {
        onDateStatusChange(dayStatus);
      }
    } catch (err) {
      console.error("Error fetching product availability:", err);
      setIsDateOk(false);
      setAvailablePackages([]);
    } finally {
      setCheckingAvail(false);
    }
  };

  useEffect(() => {
    if (isMobile && showAvailabilityPopup) {
      refetchAvailability();
    } else {
      refetchAvailability();
    }
  }, [selectedDateStr]);

   useEffect(() => {
    if (slotsLoading || selectedSlotId || slotsForPackage.length === 0) return;
    const isoDate = formatDate(
      parse(selectedDateStr, "MM/dd/yyyy", new Date()),
      "yyyy-MM-dd"
    );
    const found = slotsForPackage
      .flatMap(slot =>
        Array.isArray(slot.Time)
          ? slot.Time.map((time: string) => ({ slot, time }))
          : []
      )
      .find(({ slot, time }) => {
        const seatsLeft = (slot.available ?? currentProduct.capacity) - (slot.booked || 0);
        const cutoff = slot.cutoffTime ?? currentProduct.cutoffTime ?? 24;
        return (
          seatsLeft >= adultsCount + childrenCount &&
          isSlotBookable(isoDate, time, cutoff).isBookable
        );
      });

    if (found) {
      setSelectedSlot(found.slot);
      setSelectedSlotId(found.slot.id);
      setSelectedTimeSlot(found.time);
    }
  }, [
    slotsForPackage,
    slotsLoading,
    selectedSlotId,
    selectedDateStr,
    adultsCount,
    childrenCount,
    isSlotBookable,
  ]);

  useEffect(() => {
    if (slotsLoading) return;

    const eligiblePkgs = packagesToShow;
    if (eligiblePkgs.length === 0) {
      setIsDateOk(false);
      return;
    }

    const isoDate = formatDate(
      parse(selectedDateStr, "MM/dd/yyyy", new Date()),
      "yyyy-MM-dd"
    );

    const anyBookable = eligiblePkgs.some(pkg =>
      (pkg.slots || []).some((slot: any) =>
        Array.isArray(slot.Time) &&
        slot.Time.some((time: string) => {
          const seatsLeft =
            (slot.available ?? pkg.maxPeople ?? currentProduct.capacity) -
            (slot.booked || 0);
          const cutoff =
            slot.cutoffTime ?? currentProduct.cutoffTime ?? 24;
          const { isBookable } = isSlotBookable(isoDate, time, cutoff);
          return seatsLeft >= adultsCount + childrenCount && isBookable;
        })
      )
    );

    setIsDateOk(anyBookable);
  }, [
    packagesToShow,
    slotsLoading,
    adultsCount,
    childrenCount,
    selectedDateStr,
    currentProduct.cutoffTime,
    isSlotBookable,
    setIsDateOk,
  ]);

  return (
    <div className="order-first mt-4 lg:order-none lg:mt-0 lg:col-span-1 relative">
      <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
      <div className="flex items-center mb-2 px-2 py-1 bg-orange-50 border border-[var(--brand-primary)] rounded-lg gap-2">
        <Heart className="h-4 w-4 text-[var(--brand-primary)]" />
        <span className="text-[var(--brand-secondary)] font-semibold text-base">
          Recommended by {weeklyRecommendPercent}% travellers
        </span>
      </div>
        {/* Price Header */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs md:text-sm text-gray-600">
              Price per {cheapestPackage?.isPerGroup ? "group" : "person"}
            </span>
            {cheapestPackage &&
              cheapestPackage.discountType !== "none" &&
              cheapestPackage.discountValue > 0 && (
                <span className="bg-[var(--brand-primary)] text-white px-2 py-1 rounded text-xs font-semibold flex items-center">
                  {cheapestPackage.discountType === "percentage"
                    ? `${cheapestPackage.discountValue}% OFF`
                    : (
                        <>
                          Save&nbsp;
                          <PriceDisplay
                            amount={cheapestPackage.discountValue}
                            currency={cheapestPackage.currency}
                            className="inline"
                          />
                        </>
                      )}
                </span>
              )}
          </div>
          <div className="flex items-baseline">
            {cheapestPackage ? (
              <PriceDisplay
                amount={calculateEffectivePrice(
                  cheapestPackage.basePrice,
                  cheapestPackage.discountType,
                  cheapestPackage.discountValue
                )}
                originalAmount={
                  cheapestPackage.discountType !== "none" &&
                  cheapestPackage.discountValue > 0
                    ? cheapestPackage.basePrice
                    : undefined
                }
                currency={cheapestPackage.currency}
                showDisclaimer
                className="text-2xl md:text-3xl font-bold"
              />
            ) : (
              <span className="text-2xl md:text-3xl font-bold text-[var(--brand-primary)]">
                Contact for pricing
              </span>
            )}
            {/* <span className="text-xs md:text-sm text-gray-500 ml-2">
              per {cheapestPackage?.isPerGroup ? "group" : "person"}
              {cheapestPackage?.isPerGroup &&
                cheapestPackage.maxPeople &&
                ` (up to ${cheapestPackage.maxPeople})`}
            </span> */}
          </div>
        </div>
        {/* Universal Date & Travellers Pills */}
        <h3 className="text-xl font-semibold mb-5">Select Date and Travelers</h3>
        <div className="relative flex space-x-3 mb-6">
          <button
            onClick={() => setShowDatepicker(o => !o)}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-gray-300"
          >
            <CalendarIcon className="h-4 w-4 text-gray-700" />
            <span className="text-sm font-medium text-gray-900">
              {new Date(selectedDateStr).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </button>

          <button
            onClick={() => setShowTravellers(o => !o)}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-gray-300"
          >
            <Users className="h-4 w-4 text-gray-700" />
            <span className="text-sm font-medium text-gray-900">
              {adultsCount}A
              {isChildAllowed && childrenCount > 0 ? `/${childrenCount}C` : ""}
            </span>
          </button>

          {/* Desktop DatePicker Popover */}
          {!isMobile && showDatepicker && (
            <div 
                ref={datepickerRef}
                className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg p-4 z-20"
            >
              <DayPicker
                mode="single"
                selected={new Date(selectedDateStr)}
                fromDate={new Date()}
                onSelect={d => {
                  if (d) {
                    handleBarChange({
                      date: d.toLocaleDateString("en-US"),
                      adults: adultsCount,
                      children: childrenCount,
                    });
                    setShowDatepicker(false);
                  }
                }}
                classNames={{
                  month: "w-full",
                  nav: "w-full flex items-center justify-between",
                  caption: "text-center font-semibold mb-4",
                  table: "border-collapse w-full",
                  head_row: "items-center text-gray-400",
                  day: "w-10 h-10 flex items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                  day_selected: "bg-[var(--brand-secondary)] text-white font-semibold ring-2 ring-[var(--brand-secondary)] ring-opacity-50",
                  day_today: "border border-[var(--brand-secondary)]",
                }}
              />
            </div>
          )}

          {/* Desktop Travellers Popover */}
          {!isMobile && showTravellers && (
            <div 
                ref={travellersRef}
                className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl p-5 shadow-lg z-20 w-48"
            >
              {[
                { label: "Adults", key: "adults", value: tempAdults, min: 1 },
                ...(isChildAllowed
                  ? [{ label: "Children", key: "children", value: tempChildren, min: 0 }]
                  : []),
              ].map(({ label, key, value, min }) => (
                <div key={key} className="flex items-center justify-between mb-4">
                  <span className="font-semibold">{label}</span>
                  <div className="flex items-center space-x-2">
                    <button
                      disabled={value === min}
                      onClick={() =>
                        key==='adults'
                        ? setTempAdults(v => v-1)
                        : setTempChildren(v => v-1)
                      }
                      className={clsx(
                            "h-6 w-6 rounded-full flex items-center justify-center",
                            value === min
                            ? "bg-gray-200 text-gray-400"
                            : "bg-black text-white hover:bg-gray-800"
                        )}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span>{value}</span>
                    <button
                      disabled={capacityExceededLive}
                      title={capacityExceededLive ? capTooltip : undefined}
                      onClick={() =>
                        key==='adults'
                        ? setTempAdults(v => v+1)
                        : setTempChildren(v => v+1)
                      }
                      className="h-6 w-6 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                    handleBarChange({
                      date: selectedDateStr,
                      adults: tempAdults,
                      children: tempChildren
                    });
                    setShowTravellers(false);
                    refetchAvailability();
                }}
                className="w-full mt-2 bg-[var(--brand-primary)] text-white rounded-lg py-2"
              >
                Update
              </button>
            </div>
          )}
        
          {/* Mobile Datepicker Pop-over Sheet */}
          {isMobile && (
          <Sheet
            isOpen={showDatepicker}
            onClose={() => setShowDatepicker(false)}
            snapPoints={[0.6]}
            initialSnap={0}
          >
            <Sheet.Backdrop onTap={() => setShowDatepicker(false)} />
            <Sheet.Container>
              <Sheet.Header className="flex justify-end p-4">
                <button
                  onClick={() => setShowDatepicker(false)}
                  className="bg-gray-200 rounded-full p-2 h-8 w-8 flex items-center justify-center"
                >
                  ✕
                </button>
              </Sheet.Header>
              <Sheet.Content>
                <DayPicker
                  mode="single"
                  selected={new Date(selectedDateStr)}
                  fromDate={new Date()}
                  onSelect={d => {
                    if (d) {
                      handleBarChange({
                        date: d.toLocaleDateString("en-US"),
                        adults: adultsCount,
                        children: childrenCount,
                      });
                      setShowDatepicker(false);
                      setShowAvailabilityPopup(true);
                    }
                  }}
                  classNames={{
                    month: "w-full",
                    nav: "w-full flex items-center justify-between",
                    caption: "text-center font-semibold mb-4",
                    table: "border-collapse w-full",
                    head_row: "items-center text-gray-400",
                    day: "w-10 h-10 flex items-center justify-center rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                    day_selected: "bg-[var(--brand-secondary)] text-white font-semibold ring-2 ring-[var(--brand-secondary)] ring-opacity-50",
                    day_today: "border border-[var(--brand-secondary)]",
                  }}
                />
              </Sheet.Content>
            </Sheet.Container>
          </Sheet>
        )}

        {/* Mobile Travellers Pop-over Sheet */}
        {isMobile && (
          <Sheet
            isOpen={showTravellers}
            onClose={() => setShowTravellers(false)}
            snapPoints={[0.5]}
            initialSnap={0}
          >
            <Sheet.Backdrop onTap={() => setShowTravellers(false)} />
            <Sheet.Container>
              <Sheet.Header className="flex justify-end p-4">
                <button
                  onClick={() => setShowTravellers(false)}
                  className="bg-gray-200 rounded-full p-2 h-8 w-8 flex items-center justify-center"
                >
                  ✕
                </button>
              </Sheet.Header>
              <Sheet.Content className="p-5">
                <div ref={travellersRef}>
                    {[
                      { label: "Adults", key: "adults", value: tempAdults, min: 1 },
                      ...(isChildAllowed
                        ? [{ label: "Children", key: "children", value: tempChildren, min: 0 }]
                        : []),
                    ].map(({ label, key, value, min }) => (
                        <div key={key} className="flex items-center justify-between mb-4 last:mb-0">
                        <span className="font-semibold">{label}</span>
                        <div className="flex items-center space-x-6">
                            <button
                                disabled={value === min}
                                onClick={() =>
                                    key==='adults'
                                    ? setTempAdults(v => v-1)
                                    : setTempChildren(v => v-1)
                                }
                                className={clsx(
                                    "h-9 w-9 rounded-full flex items-center justify-center",
                                    value === min
                                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    : "bg-black text-white hover:bg-gray-800"
                                )}
                                >
                            <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-4 text-center">{value}</span>
                            <button
                                disabled={capacityExceededLive}
                                title={capacityExceededLive ? capTooltip : undefined}
                                onClick={() =>
                                    key==='adults'
                                    ? setTempAdults(v => v+1)
                                    : setTempChildren(v => v+1)
                                }
                            className="h-9 w-9 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800"
                            >
                            <Plus className="h-4 w-4" />
                            </button>
                        </div>
                        </div>
                    ))}
                    <button
                        onClick={() => {
                            handleBarChange({
                            date: selectedDateStr,
                            adults: tempAdults,
                            children: tempChildren
                            });
                            setShowTravellers(false);
                            refetchAvailability();
                            setShowAvailabilityPopup(true);
                        }}
                        className="w-full mt-2 bg-[var(--brand-primary)] text-white font-semibold rounded-lg px-4 py-2"
                    >
                        Update
                    </button>
                </div>
              </Sheet.Content>
            </Sheet.Container>
          </Sheet>
        )}
        </div>
        
        {/* Loading & “no slots” messages */}
        {!isMobile && checkingAvail && (
          <p className="text-center text-gray-500 my-4">
            Checking availability…
          </p>
        )}
        {!isMobile && isDateOk === false && !checkingAvail && !slotsLoading && (
          <p className="text-center text-red-600 my-4">
            No time slots available for this date.
            <br />
            <span className="text-sm text-gray-500">
              Please try selecting another date.
            </span>
          </p>
        )}



        <div className="flex">
          {currentProduct?.reserveNowPayLater !== false && (
            <span className="border-1 border-[var(--brand-secondary)] px-2 py-1 text-sm font-medium text-[var(--brand-secondary)] mt-2 mb-2">
                Reserve Now & Pay Later Eligible
            </span>
          )}
        </div>

        {/* Desktop sidebar inline packages */}
        {!isMobile &&
          isDateOk &&
          !checkingAvail &&
          !slotsLoading &&
          availablePackages.length > 0 &&
          !showAvailabilityPopup && (
            <div className="mt-6 space-y-4">
              <h3 className="text-base font-medium text-gray-900 mb-2">
                Choose Your Package
              </h3>
              <h4 className="text-xs text-gray-500 mb-2">
                All time slots are shown in&nbsp;IST&nbsp;(UTC +5:30)
              </h4>
              <div className="space-y-4">
                {packagesToShow.slice(0, 2)
                  .map((pkg) => {
                    const pkgSlots =
                    pkg.id === selectedPackage?.id
                      ? slotsForPackage
                      : pkg.slots || [];
                    const allTimes = pkgSlots.flatMap((slot: { Time: string[]; id: string; }) =>
                    Array.isArray(slot.Time)
                      ? slot.Time.map((t: string) => ({
                          slotId: slot.id,
                          time: t,
                          slot,
                        }))
                      : []
                  );

                  const isEnabled = ({ slot, time }: any) => {
                    const seats =
                      (slot.available ?? currentProduct.capacity) - (slot.booked || 0);
                    const cutoff = slot.cutoffTime ?? currentProduct.cutoffTime ?? 24;
                    const { isBookable } = isSlotBookable(
                      formatDate(parse(selectedDateStr, "MM/dd/yyyy", new Date()), "yyyy-MM-dd"),
                      time,
                      cutoff
                    );
                    return seats >= adultsCount + childrenCount && isBookable;
                  };

                  let preview = allTimes.slice(0, 4);
                  if (
                    preview.length === 4 &&
                    preview.every((p: string) => !isEnabled(p)) &&
                    allTimes.length > 4
                  ) {
                    const enabled = allTimes.filter(isEnabled);
                    if (enabled.length) {
                      preview = enabled.slice(0, 4);
                    }
                  }
                  const extra = allTimes.length - preview.length;
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => handlePackageSelect(pkg.id)}
                      className={`
                        border-2 rounded-lg p-4 cursor-pointer transition-all bg-white shadow-sm
                        ${
                          selectedPackage?.id === pkg.id
                            ? "border-[var(--brand-primary)] bg-orange-50"
                            : "border-gray-200 hover:border-gray-300"
                        }
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 pr-3">
                          <h4 className="text-base px-2 font-semibold text-gray-900 mb-1">
                            {pkg.name}
                          </h4>
                          <p className="text-sm px-2 text-gray-600">
                            {expandedPkgDesc === pkg.id || (pkg.description?.length ?? 0) <= DESC_LIMIT
                              ? pkg.description
                              : pkg.description.slice(0, DESC_LIMIT) + "…"}
                          </p>
                          {(pkg.description?.length ?? 0) > DESC_LIMIT && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedPkgDesc(
                                  expandedPkgDesc === pkg.id ? null : pkg.id
                                );
                              }}
                              className="ml-2 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                            >
                              {expandedPkgDesc === pkg.id ? "Read less" : "Read more"}
                            </button>
                          )}
                        </div>
                        <div
                          className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${
                              selectedPackage?.id === pkg.id
                                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                                : "border-gray-300"
                            }
                          `}
                        >
                          {selectedPackage?.id === pkg.id && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                      </div>
                      {preview.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {preview.map(({
                                slotId,
                                time,
                                slot,
                              }: {
                                slotId: string;
                                time: string;
                                slot: any;
                              })  => {
                              const seats = slot.available - (slot.booked || 0);
                              const cutoff = slot.cutoffTime ?? 24;
                              const { isBookable } = isSlotBookable(
                                formatDate(
                                  parse(selectedDateStr, "MM/dd/yyyy", new Date()),
                                  "yyyy-MM-dd"
                                ),
                                time,
                                cutoff
                              );
                              const disabled =
                                seats < adultsCount + childrenCount || !isBookable;
                              const isSel =
                                selectedSlotId === slotId &&
                                selectedTimeSlot === time;
                              return (
                                <button
                                  key={`${slotId}-${time}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!disabled) {
                                      if (pkg.id !== selectedPackage?.id) {
                                        handlePackageSelect(pkg.id);
                                      }
                                      setSelectedSlotId(slotId);
                                      setSelectedTimeSlot(time);
                                      setSelectedSlot(slot);
                                    }
                                  }}
                                  disabled={disabled}
                                  className={`
                                    border rounded-lg px-2 py-1 text-sm font-medium transition-all
                                    ${
                                      isSel
                                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                                        : "border-gray-300 hover:border-[var(--brand-secondary)] hover:text-[var(--brand-secondary)]"
                                    }
                                    ${
                                      disabled
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                    }
                                  `}
                                >
                                  {time}
                                </button>
                              );
                            })}
                          </div>
                          {extra > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAvailabilityPopup(true);
                              }}
                              className="mt-2 text-[var(--brand-secondary)] hover:text-[#0e3a41] text-sm font-medium"
                            >
                              See more time slots
                            </button>
                          )}
                        <Pricing
                            selectedPackage={selectedPackage}
                            selectedSlot={selectedSlot}
                            adultsCount={adultsCount}
                            childrenCount={childrenCount}
                            pkg={pkg}
                            product={currentProduct}
                        />
                        </div>
                      )}
                    </div>
                  );
                })}
                {packagesToShow.length > 2 && (
                  <div className="text-center">
                    <button
                      onClick={() => setShowAvailabilityPopup(true)}
                      className="mt-2 text-[var(--brand-secondary)] hover:text-[#0e3a41] text-sm font-medium"
                    >
                      See more packages
                    </button>
                  </div>
                )}
              </div>
              {selectedPackage && selectedSlotId && selectedTimeSlot && (
                <div className="mt-4">
                  <Link
                    to={'#'}
                    className="w-full block text-center bg-[var(--brand-secondary)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--brand-primary)]"
                    onClick={() => setShowAvailabilityPopup(false)}
                  >
                    Reserve Now
                  </Link>
                </div>
              )}
            </div>
          )}

        {/* Share & Contact */}
        {/* <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied to clipboard!");
            }}
            className="w-full flex items-center justify-center gap-2 py-2 text-gray-600 hover:text-[var(--brand-primary)] transition-colors"
          >
            <Share2 className="h-4 w-4" />
            Share this experience
          </button>
          <div className="mt-6 text-center">
            <p className="text-gray-600 mb-2">Need help? Contact us:</p>
            <a
              href="tel:+918003601995"
              className="text-[var(--brand-primary)] font-medium block mb-1"
            >
              +91 80036 01995
            </a>
            <a
              href="mailto:'"
              className="text-[var(--brand-primary)] font-medium"
            >
              ''
            </a>
          </div>
        </div> */}
      </div>

      {/* Package Selection pop-up */}
      {showAvailabilityPopup && (
        <div className={clsx(
            "fixed inset-0 z-50 flex overflow-auto bg-black/50",
            isMobile ? "flex-col justify-start" : "items-center justify-center p-4"
        )}>
          <div
            className={clsx(
                "bg-white flex flex-col overflow-hidden",
                isMobile
                ? "w-full h-full rounded-none"
                : "rounded-lg shadow-lg max-h-[90vh]",
                showAllTimeSlots ? "max-w-6xl" : "max-w-4xl"
            )}
          >
            {/* Header */}
            <header className={clsx(
                "flex items-center justify-between border-b",
                isMobile ? "p-4" : "p-6"
            )}>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Choose your preferred date, party size, and package
                </h2>
              </div>
              <button
                onClick={() => setShowAvailabilityPopup(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </header>

            {/* Pop-up */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
              <div className="flex space-x-3 mb-6 relative">
                {/* Date Pill inside Pop-up */}
                <button
                  onClick={() => setShowDatepicker((o) => !o)}
                  className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-gray-300"
                >
                  <CalendarIcon className="h-4 w-4 text-gray-700" />
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(selectedDateStr).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>

                {/* Travellers Pill inside Pop-up */}
                <button
                  onClick={() => setShowTravellers((o) => !o)}
                  className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-gray-300"
                >
                  <Users className="h-4 w-4 text-gray-700" />
                  <span className="text-sm font-medium text-gray-900">
                    {adultsCount}A
                    {isChildAllowed && childrenCount > 0 ? `/${childrenCount}C` : ""}
                  </span>
                </button>

                {/* Desktop Datepicker Pop-over inside Pop-up */}
                {!isMobile && showDatepicker && (
                  <div
                    ref={datepickerRef}
                    className="absolute top-full mt-2 bg-white rounded-xl shadow-lg p-4 z-20"
                  >
                    <DayPicker
                      mode="single"
                      selected={new Date(selectedDateStr)}
                      fromDate={new Date()}
                      onSelect={(d) => {
                        if (d) {
                          handleBarChange({
                            date: d.toLocaleDateString("en-US"),
                            adults: adultsCount,
                            children: childrenCount,
                          });
                          setShowDatepicker(false);
                        }
                      }}
                      classNames={{
                        month: "w-full",
                        nav: "w-full flex items-center justify-between",
                        caption: "text-center font-semibold mb-4",
                        table: "border-collapse w-full",
                        head_row: "items-center text-gray-400",
                        day: "w-10 h-10 flex items-center justify-center ml-1 mt-1 rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                        day_selected: "bg-[var(--brand-secondary)] text-white font-semibold ring-2 ring-[var(--brand-secondary)] ring-opacity-50",
                        day_today: "border border-[var(--brand-secondary)]",
                      }}
                    />
                  </div>
                )}

                {/* Desktop Travellers Pop-over inside Pop-up */}
                {!isMobile && showTravellers && (
                  <div
                    ref={travellersRef}
                    className="absolute top-full mt-2 bg-white border border-gray-200 rounded-xl p-5 shadow-lg z-20 w-60"
                  >
                    {[
                      { label: "Adults", key: "adults", value: tempAdults, min: 1 },
                      ...(isChildAllowed
                        ? [{ label: "Children", key: "children", value: tempChildren, min: 0 }]
                        : []),
                    ].map(({ label, key, value, min }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between mb-4 last:mb-0"
                      >
                        <p className="font-semibold">{label}</p>
                        <div className="flex items-center space-x-4">
                          <button
                            disabled={value === min}
                            onClick={() => key==='adults'
                                ? setTempAdults(v => v-1)
                                : setTempChildren(v => v-1)
                            }
                            className={clsx(
                              "h-8 w-8 rounded-full flex items-center justify-center",
                              value === min
                                ? "bg-gray-200 text-gray-400"
                                : "bg-black text-white hover:bg-gray-800"
                            )}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-4 text-center">{value}</span>
                          <button
                            disabled={capacityExceededLive}
                            title={capacityExceededLive ? capTooltip : undefined}
                            onClick={() => key==='adults'
                                ? setTempAdults(v => v+1)
                                : setTempChildren(v => v+1)
                            }
                            className="h-8 w-8 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        handleBarChange({
                            date: selectedDateStr,
                            adults: tempAdults,
                            children: tempChildren
                        })
                        setShowTravellers(false);
                        refetchAvailability();
                      }}
                      className="w-full mt-2 bg-[var(--brand-primary)] text-white font-semibold rounded-lg px-4 py-2"
                    >
                      Update
                    </button>
                  </div>
                )}

                {/* Mobile Datepicker Pop-over inside Pop-up */}
                {isMobile && (
                  <Sheet
                    isOpen={showDatepicker}
                    onClose={() => setShowDatepicker(false)}
                    snapPoints={[0.6]}
                    initialSnap={0}
                  >
                    <Sheet.Backdrop onTap={() => setShowDatepicker(false)} />
                    <Sheet.Container>
                      <Sheet.Header className="flex justify-end p-4">
                        <button
                          onClick={() => setShowDatepicker(false)}
                          className="bg-gray-200 rounded-full p-2 h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-800"
                        >
                          ✕
                        </button>
                      </Sheet.Header>
                      <Sheet.Content>
                        <DayPicker
                          mode="single"
                          selected={new Date(selectedDateStr)}
                          fromDate={new Date()}
                          onSelect={(d) => {
                            if (d) {
                              handleBarChange({
                                date: d.toLocaleDateString("en-US"),
                                adults: adultsCount,
                                children: childrenCount,
                              });
                              setShowDatepicker(false);
                            }
                          }}
                          classNames={{
                            month: "w-full",
                            nav: "w-full flex items-center justify-between",
                            caption: "text-center font-semibold mb-4",
                            table: "border-collapse w-full",
                            head_row: "items-center text-gray-400",
                            day: "w-10 h-10 flex items-center justify-center rounded-full hover:ring-2 hover:ring-[var(--brand-secondary)] hover:ring-opacity-50",
                            day_selected: "bg-[var(--brand-secondary)] text-white font-semibold ring-2 ring-[var(--brand-secondary)] ring-opacity-50",
                            day_today: "border border-[var(--brand-secondary)]",                        
                          }}
                        />
                      </Sheet.Content>
                    </Sheet.Container>
                  </Sheet>
                )}

                {/* Mobile Travellers Pop-over inside Pop-up */}
                {isMobile && (
                  <Sheet
                    isOpen={showTravellers}
                    onClose={() => setShowTravellers(false)}
                    snapPoints={[0.5]}
                    initialSnap={0}
                  >
                    <Sheet.Backdrop onTap={() => setShowTravellers(false)} />
                    <Sheet.Container>
                      <Sheet.Header className="flex justify-end p-4">
                        <button
                          onClick={() => setShowTravellers(false)}
                          className="bg-gray-200 rounded-full p-2 h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-800"
                        >
                          ✕
                        </button>
                      </Sheet.Header>
                      <Sheet.Content className="p-5">
                        <div ref={travellersRef}>
                            {[
                              { label: "Adults", key: "adults", value: tempAdults, min: 1 },
                              ...(isChildAllowed
                                ? [{ label: "Children", key: "children", value: tempChildren, min: 0 }]
                                : []),
                            ].map(({ label, key, value, min }) => (
                            <div
                                key={key}
                                className="flex items-center justify-between mb-4 last:mb-0"
                            >
                                <p className="font-semibold">{label}</p>
                                <div className="flex items-center space-x-6">
                                <button
                                    disabled={value === min}
                                    onClick={() => key==='adults'
                                        ? setTempAdults(v => v-1)
                                        : setTempChildren(v => v-1)
                                    }
                                    className={clsx(
                                    "h-9 w-9 rounded-full flex items-center justify-center",
                                    value === min
                                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                        : "bg-black text-white hover:bg-gray-800"
                                    )}
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-4 text-center">{value}</span>
                                <button
                                    disabled={capacityExceededLive}
                                    title={capacityExceededLive ? capTooltip : undefined}
                                    onClick={() => key==='adults'
                                        ? setTempAdults(v => v+1)
                                        : setTempChildren(v => v+1)
                                    }
                                    className="h-9 w-9 rounded-full flex items-center justify-center bg-black text-white hover:bg-gray-800"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                                </div>
                            </div>
                            ))}
                            <button
                                onClick={() => {
                                     handleBarChange({
                                      date: selectedDateStr,
                                      adults: tempAdults,
                                      children: tempChildren
                                    });
                                    setShowTravellers(false);
                                    refetchAvailability();
                                    setShowAvailabilityPopup(true);
                                }}
                                className="w-full mt-2 bg-[var(--brand-primary)] text-white font-semibold rounded-lg px-4 py-2"
                            >
                                Update
                            </button>
                        </div>
                      </Sheet.Content>
                    </Sheet.Container>
                  </Sheet>
                )}
              </div>

              {/* Packages inside pop-up */}
              {checkingAvail ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                  <div className="animate-spin w-8 h-8 mx-auto border-b-2 border-[var(--brand-primary)] rounded-full mb-4"></div>
                  <p className="text-gray-600">Checking availability...</p>
                </div>
              ) : isDateOk === false ? (
                <div className="bg-white rounded-lg shadow-sm p-6 text-center text-red-600">
                  <p className="font-medium">No availability for this date</p>
                  <p className="text-sm text-gray-500">
                    Please choose another date or party size.
                  </p>
                </div>
              ) : (
                packagesToShow.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => handlePackageSelect(pkg.id)}
                    className={`
                        bg-white rounded-lg shadow-sm p-4 mb-4 cursor-pointer
                        ${
                          selectedPackage?.id === pkg.id
                            ? "border-2 border-[var(--brand-primary)] bg-orange-50"
                            : "border border-gray-200 hover:border-gray-300"
                        }
                    `}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 pr-3">
                        {currentProduct?.reserveNowPayLater !== false && (
                          <span className="border-1 border-[var(--brand-secondary)] px-2 py-1 text-sm font-medium text-[var(--brand-secondary)] mt-2 mb-2">
                              Reserve Now & Pay Later Eligible
                          </span>
                        )}
                        <h4 className="text-lg font-semibold text-gray-900 mt-1 mb-1">
                          {pkg.name}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {expandedPkgDesc === pkg.id || (pkg.description?.length ?? 0) <= DESC_LIMIT
                            ? pkg.description
                            : pkg.description.slice(0, DESC_LIMIT) + "…"}
                        </p>
                        {(pkg.description?.length ?? 0) > DESC_LIMIT && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPkgDesc(
                                expandedPkgDesc === pkg.id ? null : pkg.id
                              );
                            }}
                            className="ml-2 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                          >
                            {expandedPkgDesc === pkg.id ? "Read less" : "Read more"}
                          </button>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPackage?.id === pkg.id
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedPackage?.id === pkg.id && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>

                    {/* Time Slots grid inside pop-up */}
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {(() => {
                        const pkgSlots =
                          pkg.id === selectedPackage?.id
                            ? slotsForPackage
                            : pkg.slots || [];

                        const allTimes = pkgSlots.flatMap((slot: { Time: string[]; }) =>
                          Array.isArray(slot.Time)
                            ? slot.Time.map((time: string) => ({ slot, time }))
                            : []
                        );
                        const isEnabled = ({ slot, time }: any) => {
                          const seats =
                            (slot.available ?? pkg.maxPeople ?? currentProduct.capacity) -
                            (slot.booked || 0);
                          const cutoff = slot.cutoffTime ?? currentProduct.cutoffTime ?? 24;
                          const { isBookable } = isSlotBookable(
                            formatDate(parse(selectedDateStr, "MM/dd/yyyy", new Date()), "yyyy-MM-dd"),
                            time,
                            cutoff
                          );
                          return seats >= adultsCount + childrenCount && isBookable;
                        };

                        let displayTimes = showAllTimeSlots ? allTimes : allTimes.slice(0, 8);
                        if (
                          !showAllTimeSlots &&
                          displayTimes.length === 8 &&
                          displayTimes.every((t: string) => !isEnabled(t)) &&
                          allTimes.length > 8
                        ) {
                          const enabled = allTimes.filter(isEnabled);
                          if (enabled.length) {
                            displayTimes = enabled.slice(0, 8);
                          }
                        }

                        return displayTimes.map(({ slot, time }: { slot: any; time: string }) => {
                          const seats = slot.available - (slot.booked || 0);
                          const cutoff = slot.cutoffTime ?? 24;
                          const { isBookable } = isSlotBookable(
                            formatDate(
                              parse(selectedDateStr, "MM/dd/yyyy", new Date()),
                              "yyyy-MM-dd"
                            ),
                            time,
                            cutoff
                          );
                          const disabled =
                            seats < adultsCount + childrenCount || !isBookable;
                          const isSel =
                            selectedSlotId === slot.id &&
                            selectedTimeSlot === time;
                          return (
                            <button
                              key={`${slot.id}-${time}`}
                              disabled={disabled}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!disabled) {
                                  setSelectedSlot(slot);
                                  setSelectedSlotId(slot.id);
                                  setSelectedTimeSlot(time);
                                }
                              }}
                              className={`
                                border rounded-lg px-3 py-2 text-sm font-medium transition-all
                                ${
                                  isSel
                                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                                    : "border-gray-300 hover:border-[var(--brand-secondary)] hover:text-[var(--brand-secondary)]"
                                }
                                ${
                                  disabled
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }
                              `}
                            >
                              {time}
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {/* See more times inside pop-up */}
                    {slotsForPackage.flatMap((s) => s.Time || []).length > 8 && (
                      <div className="mt-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAllTimeSlots(!showAllTimeSlots);
                          }}
                          className="text-[var(--brand-secondary)] hover:text-[#0e3a41] text-sm font-medium"
                        >
                          {showAllTimeSlots ? "Show less" : "See more"}
                        </button>
                      </div>
                    )}
                      <Pricing
                            selectedPackage={selectedPackage}
                            selectedSlot={selectedSlot}
                            adultsCount={adultsCount}
                            childrenCount={childrenCount}
                            pkg={pkg}
                            product={currentProduct}
                        />
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-end gap-3 p-4 border-t bg-white">
              <button
                disabled
                className="px-5 py-2 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
              >
                Reserve Now
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};