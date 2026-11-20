"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { db } from "../../lib/firebase";
import StripePayment from "./components/StripePayment";
import { createReservationDraft, getReservation } from "./api/reservationsApi";
import TourSelectionModal from "./components/TourSelectionModal";
import ExistingPaymentsDialog from "./components/ExistingPaymentsDialog";
import ReservationProgressHeader from "./components/ReservationProgressHeader";
import Step2ReservationSummaryCard from "./components/Step2ReservationSummaryCard";
import Step2PaymentStatePanel from "./components/Step2PaymentStatePanel";
import Step2PaymentHeader from "./components/Step2PaymentHeader";
import Step3ReservationConfirmedBanner from "./components/Step3ReservationConfirmedBanner";
import Step3PaymentPlanSelectorCard from "./components/Step3PaymentPlanSelectorCard";
import StepFooterActionsSection from "./components/StepFooterActionsSection";
import Step1PersonalReservationSection from "./components/Step1PersonalReservationSection";
import ReservationTourSelectionSidebarCard from "./components/ReservationTourSelectionSidebarCard";
import SaleHoldBanner from "./components/SaleHoldBanner";
import SaleOfferPrompt from "./components/SaleOfferPrompt";
import { useSaleHold } from "./hooks/effects/useSaleHold";
import { useSaleOffer } from "./hooks/effects/useSaleOffer";
import { useStep3Countdown } from "./hooks/effects/useStep3Countdown";
import {
  calculateDaysBetween,
  MIN_DAYS_BEFORE_TOUR,
  isTourAllDatesTooSoon,
} from "./utils/bookingFlow";
import {
  canPreviewStep3FromSelection,
  canSelectStep3PlansFromPaymentState,
} from "./utils/step3Access";
import {
  getCountryData,
  safeGetCountryCallingCode,
} from "./utils/countryPhoneData";
import { buildReservationDraftPayload } from "./utils/reservationDraftPayload";
import { getUtm } from "./utils/utmCapture";
import { createDefaultReservationSideEffects } from "./side-effects/defaultSideEffects";
import {
  useConfirmBookingFlow,
  useDiscardExistingPaymentFlow,
  useExistingPaymentCheck,
  usePaymentSuccessFlow,
  useReservationCatalogState,
  useReservationCatalogSubscriptions,
  useReservationCustomerState,
  useReservationFlowState,
  useReservationGuestPersistence,
  useReservationGuestUiController,
  useReservationPaymentIntentSync,
  useReservationPaymentPlanning,
  useReservationPaymentVerification,
  useReservationStepPresentation,
  useReservationTourSelectionState,
  useReservationUiEffects,
  useReservationUiState,
  useReservationUrlSync,
  useReservationValidation,
  useStepFooterActionsProps,
  useStep1SectionProps,
  useReuseExistingPaymentFlow,
  useSessionRestore,
} from "./hooks";
import { getNationalityOptions } from "./utils/nationalityUtils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import { slotSalePrice } from "@/lib/sale/slots";

const Page = () => {
  const DEBUG = true;
  const {
    email,
    setEmail,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    errors,
    setErrors,
    birthdate,
    setBirthdate,
    nationality,
    setNationality,
    whatsAppNumber,
    setWhatsAppNumber,
    whatsAppCountry,
    setWhatsAppCountry,
    bookingType,
    setBookingType,
    groupSize,
    setGroupSize,
    tourPackage,
    setTourPackage,
    tourDate,
    setTourDate,
    additionalGuests,
    setAdditionalGuests,
    activeGuestTab,
    setActiveGuestTab,
    guestDetails,
    setGuestDetails,
  } = useReservationCustomerState();

  const {
    tourPackages,
    setTourPackages,
    tourDates,
    setTourDates,
    isLoadingPackages,
    setIsLoadingPackages,
    paymentTerms,
    setPaymentTerms,
    selectedPaymentPlan,
    setSelectedPaymentPlan,
    fetchedPaymentPlanLabel,
    setFetchedPaymentPlanLabel,
    paymentPlans,
    setPaymentPlans,
    activePaymentTab,
  } = useReservationCatalogState();

  const {
    sessionLoading,
    setSessionLoading,
    isCreatingPayment,
    setIsCreatingPayment,
    step2Processing,
    setStep2Processing,
    showTourModal,
    setShowTourModal,
    highlightsExpanded,
    setHighlightsExpanded,
    carouselIndex,
    setCarouselIndex,
    isCarouselPaused,
    setIsCarouselPaused,
    dateMounted,
    setDateMounted,
    dateVisible,
    setDateVisible,
    guestsWrapRef,
    guestsContentRef,
    guestsMounted,
    setGuestsMounted,
    setGuestsHeight,
    clearing,
    setClearing,
    howItWorksExpanded,
    setHowItWorksExpanded,
    sessionRestoredRef,
    ANIM_DURATION,
  } = useReservationUiState();

  // ---- multi-step flow state ----
  const {
    step,
    setStep,
    completedSteps,
    setCompletedSteps,
    paymentConfirmed,
    setPaymentConfirmedState,
    bookingId,
    setBookingId,
    bookingConfirmed,
    setBookingConfirmed,
    confirmingBooking,
    setConfirmingBooking,
    paymentDocId,
    setPaymentDocId,
    showEmailModal,
    setShowEmailModal,
    modalLoading,
    setModalLoading,
    foundStripePayments,
    setFoundStripePayments,
  } = useReservationFlowState();

  // Flow setter alias used across composed hooks.
  const setPaymentConfirmed = setPaymentConfirmedState;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sideEffects = createDefaultReservationSideEffects({ router });
  const previousStepRef = useRef(step);
  const stepSwipeDirection = step >= previousStepRef.current ? 1 : -1;
  const [step1ValidationAttempted, setStep1ValidationAttempted] =
    useState(false);
  const [validationToastDismissed, setValidationToastDismissed] =
    useState(false);
  const visibleStep1Errors = step1ValidationAttempted ? errors : {};

  // Get reservation fee from selected package (not the full deposit)
  const selectedPackage = tourPackages.find((p) => p.id === tourPackage);

  // Custom pricing logic
  const selectedDateDetail = selectedPackage?.travelDateDetails?.find(
    (d) => d.date === tourDate,
  );
  const customDeposit = selectedDateDetail?.customDeposit;
  const hasCustomDeposit = selectedDateDetail?.hasCustomDeposit === true;

  const baseReservationFee = hasCustomDeposit
    ? (customDeposit ?? (selectedPackage as any)?.deposit ?? 250)
    : ((selectedPackage as any)?.deposit ?? 250);

  // Calculate total reservation fee based on booking type
  const numberOfPeople =
    bookingType === "Group Booking"
      ? groupSize
      : bookingType === "Duo Booking"
        ? 2
        : 1;
  const depositAmount = baseReservationFee * numberOfPeople;
  const canPreviewStep3 = canPreviewStep3FromSelection(tourPackage, tourDate);
  const canSelectStep3Plans =
    canSelectStep3PlansFromPaymentState(paymentConfirmed);

  const { replaceWithPaymentId } = useReservationUrlSync({
    debug: DEBUG,
    router,
    searchParams,
    step,
    selectedPackageSlug: selectedPackage?.slug,
    isLoadingPackages,
    paymentDocId,
    tourPackages,
    tourPackage,
    tourDate,
    setTourPackage,
    setTourDate,
  });

  const getReservationDraftPayload = () =>
    buildReservationDraftPayload({
      email,
      firstName,
      lastName,
      birthdate,
      nationality,
      whatsAppNumber,
      whatsAppCountry,
      bookingType,
      groupSize,
      guestDetails,
      tourPackage,
      tourPackageName: selectedPackage?.name || "",
      tourDate,
      depositAmount,
      customOriginal: selectedDateDetail?.customOriginal,
      utm: getUtm(),
      safeGetCountryCallingCodeFn: safeGetCountryCallingCode,
    });

  // Create a new placeholder stripePayments doc and set session state
  const createPlaceholder = async () => {
    try {
      const newDocId = await createReservationDraft(getReservationDraftPayload());
      setPaymentDocId(newDocId);
      try {
        sessionStorage.setItem(
          `stripe_payment_doc_${email}_${tourPackage}`,
          newDocId,
        );
      } catch {}
      return newDocId;
    } catch (err) {
      console.error("Error creating payment placeholder:", err);
      // A 400 is a problem with what was entered (e.g. an email domain that
      // can't take mail): show the server's own message.
      const status = (err as { status?: number })?.status;
      alert(status === 400 && err instanceof Error ? err.message : "Unable to create payment record. Please try again.");
      return null;
    }
  };

  const { handleReuseExisting } = useReuseExistingPaymentFlow({
    sideEffects,
    pathname: pathname || "",
    email,
    tourPackage,
    selectedPackageName: selectedPackage?.name || "",
    depositAmount,
    completedSteps,
    safeGetCountryCallingCodeFn: safeGetCountryCallingCode,
    setEmail,
    setFirstName,
    setLastName,
    setBirthdate,
    setNationality,
    setWhatsAppCountry: (value) => setWhatsAppCountry(value),
    setWhatsAppNumber,
    setBookingType,
    setGroupSize,
    setAdditionalGuests,
    setGuestsMounted,
    setGuestsHeight,
    getGuestsContentHeight: () => guestsContentRef.current?.scrollHeight ?? 0,
    setTourPackage,
    setTourDate,
    setIsCreatingPayment,
    setShowEmailModal,
    setPaymentDocId,
    setFetchedPaymentPlanLabel,
    setBookingId,
    setPaymentConfirmed,
    setBookingConfirmed,
    setSelectedPaymentPlan,
    setCompletedSteps,
    setStep,
    replaceWithPaymentId,
  });

  const { handleDiscardExisting } = useDiscardExistingPaymentFlow({
    sideEffects,
    foundStripePayments,
    createPlaceholder,
    email,
    tourPackage,
    selectedPackageName: selectedPackage?.name || "",
    depositAmount,
    completedSteps,
    setFoundStripePayments,
    setCompletedSteps,
    setShowEmailModal,
    setStep,
    setIsCreatingPayment,
  });

  useReservationPaymentIntentSync({
    bookingType,
    groupSize,
    depositAmount,
    paymentDocId,
    selectedPackage,
    numberOfPeople,
    step,
  });

  // Auto-rotate carousel effect
  useEffect(() => {
    if (!highlightsExpanded || !selectedPackage?.highlights || isCarouselPaused)
      return;

    const highlightsWithImages = selectedPackage.highlights.filter(
      (h) => typeof h === "object" && h.image,
    );

    if (highlightsWithImages.length <= 1) return;

    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % highlightsWithImages.length);
    }, 3000); // Change image every 3 second

    return () => clearInterval(interval);
  }, [highlightsExpanded, selectedPackage?.highlights, isCarouselPaused]);

  // Reset carousel when popup opens/closes
  useEffect(() => {
    if (!highlightsExpanded) {
      setCarouselIndex(0);
      setIsCarouselPaused(false);
    }
  }, [highlightsExpanded]);

  useReservationCatalogSubscriptions({
    db,
    debug: DEBUG,
    setTourPackages,
    setIsLoadingPackages,
    setPaymentTerms,
  });

  useReservationTourSelectionState({
    email,
    tourPackage,
    tourPackages,
    isLoadingPackages,
    paymentDocId,
    tourDate,
    setPaymentDocId,
    replaceWithPaymentId,
    setTourPackage,
    setTourDates,
    setTourDate,
  });

  const secondsToPaymentPlan = useStep3Countdown({
    step,
    paymentConfirmed,
    onDone: () => setStep(3),
  });

  const sale = useSaleHold();
  const saleHold = sale.hold;
  const saleLocksSelection =
    !!saleHold && (sale.phase === "active" || sale.phase === "secured");
  const saleExcludedDates = saleLocksSelection ? saleHold?.excludedDates : undefined;

  // Regular-price customers: which dates are in an open sale (tagged in the date
  // list; picking one sends them to the sale).
  const saleOffer = useSaleOffer(tourPackage, tourDate, !sale.isSaleHold && !paymentConfirmed);

  // A hold can't be used on a date left out of the sale; the payment step refuses it too.
  useEffect(() => {
    if (tourDate && saleExcludedDates?.includes(tourDate)) setTourDate("");
  }, [tourDate, saleExcludedDates, setTourDate]);

  // Sale holds: each traveller pays their own slot's price (slot order = traveller
  // order). Once a date is picked the discount comes off that date's price (its own
  // price if it has one); before that, the hold's "from" prices.
  const saleDatePrice =
    tourDate && selectedPackage
      ? typeof selectedDateDetail?.customOriginal === "number" && selectedDateDetail.customOriginal > 0
        ? selectedDateDetail.customOriginal
        : (selectedPackage as { price?: number }).price ?? null
      : null;
  const heldTravellerPrices =
    saleHold && (sale.phase === "active" || sale.phase === "secured")
      ? [...saleHold.slots]
          .sort((a, b) => a.index - b.index)
          .map((s) => {
            if (saleDatePrice == null) return s.salePrice;
            const discountGBP = s.discountGBP ?? Math.max(0, s.originalPrice - s.salePrice);
            // A percent slot takes its % off this date's price (same rule as init-payment).
            return slotSalePrice(saleDatePrice, { discountGBP, discountPct: s.discountPct });
          })
      : null;

  // A refresh after payment loses the hold in this tab, so the prices paid come
  // from the payment itself.
  const [paidSalePrices, setPaidSalePrices] = useState<number[] | null>(null);
  const hasHeldPrices = !!heldTravellerPrices;
  useEffect(() => {
    if (!paymentConfirmed || !paymentDocId || hasHeldPrices) return;
    let cancelled = false;
    getReservation(paymentDocId)
      .then((reservation) => {
        const slots: { index: number; salePrice: number }[] | undefined =
          reservation?.sale?.slots;
        if (cancelled || !slots?.length) return;
        setPaidSalePrices(
          [...slots].sort((a, b) => a.index - b.index).map((s) => s.salePrice),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paymentConfirmed, paymentDocId, hasHeldPrices]);
  const saleTravellerPrices = heldTravellerPrices ?? paidSalePrices;

  const {
    availablePaymentTerm,
    selectedTourPrice,
    totalPartyPrice,
    regularPartyPrice,
    availablePaymentPlans,
    selectedPaymentPlanLabel,
    allPlansSelected,
    handleSelectPaymentPlanForActiveTraveler,
  } = useReservationPaymentPlanning({
    tourDate,
    selectedPackage,
    selectedDateDetail,
    numberOfPeople,
    depositAmount,
    paymentTerms,
    fetchedPaymentPlanLabel,
    selectedPaymentPlan,
    paymentPlans,
    activePaymentTab,
    setPaymentPlans,
    saleTravellerPrices,
  });

  const { progressValue, stepDescription } = useReservationStepPresentation({
    step,
    paymentConfirmed,
    bookingConfirmed,
    selectedPackage,
    bookingType,
    depositAmount,
    baseReservationFee,
    numberOfPeople,
    availablePaymentTerm,
    tourDate,
    availablePaymentPlansCount: availablePaymentPlans.length,
    canSelectStep3Plans,
  });

  const { validate, isFieldValid } = useReservationValidation({
    email,
    firstName,
    lastName,
    birthdate,
    nationality,
    whatsAppNumber,
    whatsAppCountry,
    bookingType,
    groupSize,
    tourPackage,
    tourDate,
    guestDetails,
    setErrors,
    setActiveGuestTab,
    safeGetCountryCallingCodeFn: safeGetCountryCallingCode,
    isValidPhoneNumberFn: isValidPhoneNumber,
  });

  // shared field classes with enhanced styling
  const fieldBase =
    "mt-1 block w-full px-4 py-3 rounded-lg bg-input text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:bg-muted/40 disabled:cursor-not-allowed disabled:text-muted-foreground";
  const fieldBorder = (err?: boolean) =>
    `border-2 ${err ? "border-destructive" : "border-border"}`;
  const fieldFocus =
    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-md hover:border-primary/50 disabled:focus:outline-none disabled:focus:ring-0 disabled:hover:border-primary/50 disabled:hover:shadow-sm";
  const fieldWithIcon = "pl-11";

  // Get all nationalities from world-countries library
  const nationalityOptions = getNationalityOptions();

  const bookingTypeOptions = [
    { label: "Single Booking", value: "Single Booking" },
    { label: "Duo Booking", value: "Duo Booking" },
    { label: "Group Booking", value: "Group Booking" },
  ];

  const tourDateOptions = (tourDates ?? [])
    .filter((d: string) => !saleExcludedDates?.includes(d))
    .map((d: string) => {
    const daysBetween = calculateDaysBetween(d);
    const isInvalid = daysBetween < MIN_DAYS_BEFORE_TOUR;

    const dateObj = new Date(d);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return {
      label: formattedDate,
      value: d,
      badge: saleOffer.isOnSale(d) ? saleOffer.offer?.saleName : undefined,
      disabled: isInvalid,
      description: isInvalid
        ? `Too soon! Please choose a date at least ${MIN_DAYS_BEFORE_TOUR} days from today`
        : undefined,
    };
  });

  const { handlePaymentSuccess } = usePaymentSuccessFlow({
    email,
    tourPackage,
    tourName: selectedPackage?.name || undefined,
    completedSteps,
    setCompletedSteps,
    setPaymentConfirmed,
    setBookingId,
  });

  useSessionRestore({
    searchParams,
    debug: DEBUG,
    replaceWithPaymentId,
    safeGetCountryCallingCode,
    customerSlice: {
      setEmail,
      setFirstName,
      setLastName,
      setBirthdate,
      setNationality,
      setWhatsAppCountry: (value) => setWhatsAppCountry(value),
      setWhatsAppNumber,
    },
    bookingSlice: {
      setBookingType,
      setGroupSize,
      setAdditionalGuests,
      setTourPackage,
      setTourDate,
      setFetchedPaymentPlanLabel,
      setSelectedPaymentPlan,
    },
    uiSlice: {
      setSessionLoading,
      setGuestsMounted,
      setGuestsHeight,
      guestsContentRef,
    },
    flowSlice: {
      setPaymentDocId,
      setPaymentConfirmed,
      setBookingConfirmed,
      setBookingId,
      setStep,
      setCompletedSteps,
    },
  });

  useReservationUiEffects({
    tourPackage,
    showTourModal,
    setDateMounted,
    setDateVisible,
    setTourDate,
    setErrors,
  });

  useReservationPaymentVerification({
    paymentConfirmed,
    step,
    setPaymentConfirmed,
    setCompletedSteps,
  });

  const {
    animateHeight,
    handleBookingTypeChange,
    handleGroupSizeChange,
    handleGuestDetailsUpdate,
  } = useReservationGuestUiController({
    bookingType,
    setBookingType,
    groupSize,
    setGroupSize,
    additionalGuests,
    setAdditionalGuests,
    guestDetails,
    setGuestDetails,
    activeGuestTab,
    setActiveGuestTab,
    guestsMounted,
    setGuestsMounted,
    guestsWrapRef,
    guestsContentRef,
    setGuestsHeight,
    ANIM_DURATION,
  });

  // A Black Friday hold fixes the tour and the party size; the date stays free.
  useEffect(() => {
    if (!saleHold || !saleLocksSelection || paymentConfirmed || isLoadingPackages) return;
    if (tourPackage !== saleHold.tourPackageId) {
      if (tourPackages.some((p) => p.id === saleHold.tourPackageId)) {
        setTourPackage(saleHold.tourPackageId);
      }
      return;
    }
    const size = saleHold.partySize;
    const wanted =
      size === 1 ? "Single Booking" : size === 2 ? "Duo Booking" : "Group Booking";
    if (bookingType !== wanted) {
      void handleBookingTypeChange(wanted);
    } else if (wanted === "Group Booking" && groupSize !== size) {
      handleGroupSizeChange(size);
    }
  }, [
    saleHold,
    saleLocksSelection,
    paymentConfirmed,
    isLoadingPackages,
    tourPackage,
    tourPackages,
    setTourPackage,
    bookingType,
    groupSize,
    handleBookingTypeChange,
    handleGroupSizeChange,
  ]);

  const step1SectionProps = useStep1SectionProps({
    step,
    paymentConfirmed,
    clearing,
    selectedPackage,
    tourDate,
    errors: visibleStep1Errors,
    showValidationFeedback: step1ValidationAttempted,
    bookingType,
    groupSize,
    activeGuestTab,
    guestDetails,
    email,
    birthdate,
    firstName,
    lastName,
    nationality,
    whatsAppCountry,
    whatsAppNumber,
    bookingTypeOptions,
    nationalityOptions,
    fieldBase,
    fieldWithIcon,
    fieldFocus,
    fieldBorder,
    isFieldValid,
    handleBookingTypeChange,
    handleGroupSizeChange,
    setActiveGuestTab,
    setEmail,
    setBirthdate,
    setFirstName,
    setLastName,
    setNationality,
    setWhatsAppCountry,
    setWhatsAppNumber,
    setErrors,
    handleGuestDetailsUpdate,
    getCountryData,
    safeGetCountryCallingCode,
  });

  useReservationGuestPersistence({
    bookingType,
    additionalGuests,
    email,
    tourPackage,
    sessionRestoredRef,
    setAdditionalGuests,
    paymentDocId,
    guestDetails,
    setGuestDetails,
    setGroupSize,
    paymentPlans,
    setPaymentPlans,
    step,
    selectedDateDetail,
    selectedPackage,
    depositAmount,
    safeGetCountryCallingCode,
  });

  const { checkExistingPaymentsAndMaybeProceed } = useExistingPaymentCheck({
    email,
    skipLookup: sale.isSaleHold,
    selectedPackageName: selectedPackage?.name || "",
    tourDate,
    replaceWithPaymentId,
    formSlice: {
      validate,
      isCreatingPayment,
      getReservationDraftPayload,
      createPlaceholder,
    },
    flowSlice: {
      paymentDocId,
      completedSteps,
      setCompletedSteps,
      setStep,
    },
    uiSlice: {
      setIsCreatingPayment,
      setModalLoading,
      setFoundStripePayments,
      setShowEmailModal,
    },
  });
  const { handleConfirmBooking } = useConfirmBookingFlow({
    paymentConfirmed,
    isLastMinute: availablePaymentTerm.isLastMinute,
    allPlansSelected,
    numberOfPeople,
    paymentPlans,
    availablePaymentPlans,
    bookingId,
    paymentDocId,
    email,
    tourPackage,
    setConfirmingBooking,
    setFetchedPaymentPlanLabel,
    setBookingConfirmed,
  });

  const stepFooterActionsProps = useStepFooterActionsProps({
    step,
    bookingConfirmed,
    paymentConfirmed,
    confirmingBooking,
    completedSteps,
    setCompletedSteps,
    setStep,
    setClearing,
    guestsWrapRef,
    animateHeight,
    setGuestsHeight,
    setGuestsMounted,
    setDateVisible,
    setEmail,
    setFirstName,
    setLastName,
    setBirthdate,
    setNationality,
    setBookingType,
    setTourPackage,
    setTourDate,
    setAdditionalGuests,
    setGroupSize,
    setErrors,
    errors,
    step1ValidationAttempted,
    setStep1ValidationAttempted,
    validationToastDismissed,
    setValidationToastDismissed,
    ANIM_DURATION,
    checkExistingPaymentsAndMaybeProceed,
    isCreatingPayment,
    email,
    birthdate,
    firstName,
    lastName,
    whatsAppNumber,
    whatsAppCountry,
    nationality,
    bookingType,
    tourPackage,
    tourDate,
    groupSize,
    guestDetails,
    safeGetCountryCallingCodeFn: safeGetCountryCallingCode,
    isValidPhoneNumberFn: isValidPhoneNumber,
    handleConfirmBooking,
    availablePaymentTerm,
    allPlansSelected,
    bookingId: bookingId || "PENDING",
    selectedPackage,
    selectedDateDetail,
    totalPartyPrice,
    regularPartyPrice,
    depositAmount,
    numberOfPeople,
    selectedPaymentPlanLabel,
  });

  const handleCreateNewReservation = async () => {
    setShowEmailModal(false);
    setIsCreatingPayment(true);
    const id = await createPlaceholder();
    if (!completedSteps.includes(1)) {
      setCompletedSteps([...completedSteps, 1]);
    }
    if (id) {
      try {
        replaceWithPaymentId(id);
      } catch (err) {
        console.debug("Failed to set paymentid query param:", err);
      }
    }
    setStep(2);
    setIsCreatingPayment(false);
  };

  const handleStep1Navigation = () => {
    setStep(1);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get("paymentid");
      if (!pid) {
        setPaymentConfirmed(false);
      }
    }
  };

  const handleStep2Navigation = () => {
    if (completedSteps.includes(1) && !completedSteps.includes(2)) {
      checkExistingPaymentsAndMaybeProceed();
    } else if (completedSteps.includes(2) && step !== 2) {
      setStep(2);
    }
  };

  const handleStep3Navigation = () => {
    if (canPreviewStep3) {
      setStep(3);
    }
  };

  useEffect(() => {
    previousStepRef.current = step;
  }, [step]);

  // With a sale hold the countdown bar sits above the form, so start at the top
  // instead of centring (centring pushed the form heading under the bar).
  const shouldCenterRightPanel = step === 1 && !sale.isSaleHold;

  return (
    <div
      className={`relative theme-transition bg-background overflow-x-hidden ${
        showTourModal ? "overflow-y-hidden" : "overflow-y-auto"
      } min-h-screen lg:h-screen lg:overflow-hidden scrollbar-hide`}
    >
      <div className="pointer-events-none absolute inset-0 hidden lg:grid lg:grid-cols-2">
        <div className="bg-[#EF3340]" />
        <div className="bg-background" />
      </div>

      {/* Theme Toggle Button */}
      {/* On phones the sale countdown bar takes the top edge; keep the toggle out of its way. */}
      <div className={`fixed top-6 right-6 z-50 ${sale.isSaleHold ? "hidden lg:block" : ""}`}>
        <ThemeToggle />
      </div>

      <ExistingPaymentsDialog
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        modalLoading={modalLoading}
        foundStripePayments={foundStripePayments}
        isCreatingPayment={isCreatingPayment}
        onReuseExisting={handleReuseExisting}
        onDiscardExisting={handleDiscardExisting}
        onCreateNewReservation={handleCreateNewReservation}
      />

      <div
        className="relative z-10 w-full min-h-screen text-card-foreground px-4 py-6 sm:px-6 sm:py-8 lg:px-0 lg:py-0 lg:h-screen"
        aria-labelledby="reservation-form-title"
      >
        {sessionLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
              {/* <p className="mt-3 text-sm text-foreground/90">Restoring your reservation…</p> */}
            </div>
          </div>
        )}
        {/* assistive live region to announce tour date visibility changes */}
        <div aria-live="polite" className="sr-only">
          {dateVisible ? "Tour date shown" : "Tour date hidden"}
        </div>

        {/* Max-width container for better readability on larger screens */}
        <div className="mx-auto w-full max-w-[1600px] lg:h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-0 items-stretch lg:h-full lg:min-h-0">
            <aside className="-mx-4 -mt-6 sm:-mx-6 sm:-mt-8 lg:mx-0 lg:mt-0 bg-[#EF3340] px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-10 lg:border-r lg:border-[#d72e3a] lg:h-full lg:min-h-0">
              <div className="mx-auto w-full max-w-[760px] flex flex-col gap-5 sm:gap-6 lg:h-full lg:justify-center">
                <div className="inline-flex self-start px-1 py-1">
                  <img
                    src="/logos/Logo_White.svg"
                    alt="ImHereTravels Logo"
                    className="h-7 sm:h-8 w-auto object-contain"
                  />
                </div>

                <ReservationProgressHeader
                  step={step}
                  completedSteps={completedSteps}
                  canPreviewStep3={canPreviewStep3}
                  progressValue={progressValue}
                  stepDescription={stepDescription}
                  howItWorksExpanded={howItWorksExpanded}
                  onToggleHowItWorks={() =>
                    setHowItWorksExpanded(!howItWorksExpanded)
                  }
                  onGoStep1={handleStep1Navigation}
                  onGoStep2={handleStep2Navigation}
                  onGoStep3={handleStep3Navigation}
                />

                <ReservationTourSelectionSidebarCard
                  step={step}
                  paymentConfirmed={paymentConfirmed}
                  isLoadingPackages={isLoadingPackages}
                  selectedPackage={selectedPackage}
                  highlightsExpanded={highlightsExpanded}
                  carouselIndex={carouselIndex}
                  dateVisible={dateVisible}
                  dateMounted={dateMounted}
                  tourPackage={tourPackage}
                  tourDate={tourDate}
                  errors={visibleStep1Errors}
                  tourDateOptions={tourDateOptions}
                  setShowTourModal={setShowTourModal}
                  setHighlightsExpanded={setHighlightsExpanded}
                  setIsCarouselPaused={setIsCarouselPaused}
                  setCarouselIndex={setCarouselIndex}
                  setTourDate={setTourDate}
                  tourLocked={saleLocksSelection}
                  saleTotal={
                    saleTravellerPrices
                      ? saleTravellerPrices.reduce((sum, p) => sum + p, 0)
                      : null
                  }
                />
              </div>
            </aside>

            <div
              className={`min-w-0 overflow-x-hidden lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-8 lg:flex ${
                shouldCenterRightPanel ? "lg:items-center" : "lg:items-start"
              } scrollbar-hide ${
                showTourModal ? "lg:overflow-hidden" : ""
              }`}
            >
              <div
                className={`mx-auto w-full max-w-[760px] ${
                  sale.isSaleHold ? "pt-12 lg:pt-0" : ""
                }`}
              >
                <SaleHoldBanner sale={sale} prices={saleTravellerPrices} />
                <SaleOfferPrompt
                  offer={saleOffer.offer}
                  tourDate={tourDate}
                  active={step === 1 && saleOffer.isOnSale(tourDate)}
                  onChooseAnotherDate={() => setTourDate("")}
                />
                <AnimatePresence mode="wait" initial={false} custom={stepSwipeDirection}>
                  <motion.div
                    key={`reservation-step-${step}`}
                    custom={stepSwipeDirection}
                    initial={{ opacity: 0, x: stepSwipeDirection > 0 ? 42 : -42 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: stepSwipeDirection > 0 ? -42 : 42 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-6"
                  >
                    {step === 1 && (
                      <Step1PersonalReservationSection
                        {...step1SectionProps}
                        partyLocked={saleLocksSelection}
                      />
                    )}

                    {/* STEP 2 - PAYMENT */}
                    {step === 2 && (
                      <div className="space-y-4">
                        <Step2PaymentHeader />

                        <Step2PaymentStatePanel
                          tourPackage={tourPackage}
                          paymentConfirmed={paymentConfirmed}
                          step2Processing={step2Processing}
                          secondsToPaymentPlan={secondsToPaymentPlan}
                        >
                          <Step2ReservationSummaryCard
                            bookingType={bookingType}
                            tourPackage={tourPackage}
                            tourPackages={tourPackages}
                            numberOfPeople={numberOfPeople}
                            baseReservationFee={baseReservationFee}
                            depositAmount={depositAmount}
                          />

                          {/* Waits for the hold: starting without it would take the regular-price path. */}
                          {sale.phase !== "loading" && (
                          <StripePayment
                            tourPackageId={tourPackage}
                            tourPackageName={selectedPackage?.name || ""}
                            email={email}
                            amountGBP={depositAmount}
                            bookingId={bookingId || "PENDING"}
                            paymentDocId={paymentDocId}
                            bookingType={bookingType}
                            numberOfGuests={numberOfPeople}
                            saleHold={sale.isSaleHold ? sale.holdParam : null}
                            onBeforeConfirm={
                              sale.isSaleHold ? sale.markPaying : undefined
                            }
                            onPaymentFailed={
                              sale.isSaleHold ? sale.clearPaying : undefined
                            }
                            onSuccess={async (pid, docId) => {
                              if (sale.isSaleHold) sale.markSecured();
                              await handlePaymentSuccess(pid, docId);
                            }}
                            onError={() => {}}
                            onProcessingChange={(p) => setStep2Processing(p)}
                          />
                          )}
                        </Step2PaymentStatePanel>
                      </div>
                    )}
                    {/* STEP 3 - PAYMENT PLAN */}
                    {(step as number) === 3 && (
                      <div className="space-y-6">
                        {paymentConfirmed ? (
                          <Step3ReservationConfirmedBanner
                            bookingId={bookingId}
                            planChosen={bookingConfirmed}
                            isLastMinute={availablePaymentTerm.isLastMinute}
                          />
                        ) : (
                          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500 text-white flex-shrink-0">
                                <svg
                                  className="h-5 w-5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  aria-hidden
                                >
                                  <path
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </div>
                              <div>
                                <p className="font-semibold text-foreground text-sm sm:text-base">
                                  Preview available payment plans
                                </p>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                  You are previewing payment terms for your selected
                                  tour date. Plan selection unlocks after you complete
                                  Step 2 payment.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <Step3PaymentPlanSelectorCard
                          paymentPlans={paymentPlans}
                          guestDetails={guestDetails}
                          selectedTourPrice={selectedTourPrice}
                          depositAmount={depositAmount}
                          numberOfPeople={numberOfPeople}
                          availablePaymentTerm={availablePaymentTerm}
                          availablePaymentPlans={availablePaymentPlans}
                          selectionLocked={!canSelectStep3Plans}
                          onSelectPaymentPlanForActiveTraveler={
                            handleSelectPaymentPlanForActiveTraveler
                          }
                          tourDate={tourDate}
                        />
                      </div>
                    )}

                    {/* Step footer actions */}
                    <StepFooterActionsSection {...stepFooterActionsProps} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tour Selection Modal */}
      <TourSelectionModal
        isOpen={showTourModal}
        onClose={() => setShowTourModal(false)}
        tourPackages={tourPackages}
        isLoadingPackages={isLoadingPackages}
        selectedTourId={tourPackage}
        onSelectTour={setTourPackage}
        isTourAllDatesTooSoon={isTourAllDatesTooSoon}
      />
    </div>
  );
};

export default function ReservationBookingFormPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <Page />
      </Suspense>
    </>
  );
}
