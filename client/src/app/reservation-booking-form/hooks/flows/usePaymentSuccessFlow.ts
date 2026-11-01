import { useCallback } from "react";
import type { Firestore } from "firebase/firestore";
import { SALE_CONFLICT_ERROR, runPaymentSuccessAction } from "../../actions/paymentSuccessAction";

type UsePaymentSuccessFlowOptions = {
  db: Firestore;
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  bookingType: string;
  groupSize: number;
  tourPackage: string;
  tourDate: string;
  selectedPackageName: string;
  selectedPackageDeposit: number;
  completedSteps: number[];
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
  setPaymentConfirmed: (value: boolean) => void;
  setBookingId: (value: string) => void;
};

export const usePaymentSuccessFlow = ({
  db,
  email,
  firstName,
  lastName,
  birthdate,
  nationality,
  bookingType,
  groupSize,
  tourPackage,
  tourDate,
  selectedPackageName,
  selectedPackageDeposit,
  completedSteps,
  setCompletedSteps,
  setPaymentConfirmed,
  setBookingId,
}: UsePaymentSuccessFlowOptions) => {
  const handlePaymentSuccess = useCallback(
    async (paymentIntentId?: string, paymentDocId?: string) => {
      await runPaymentSuccessAction({
        db,
        paymentIntentId,
        paymentDocId,
        email,
        firstName,
        lastName,
        birthdate,
        nationality,
        bookingType,
        groupSize,
        tourPackage,
        tourDate,
        selectedPackageName,
        selectedPackageDeposit,
        completedSteps,
        setCompletedSteps,
        setPaymentConfirmed,
        setBookingId,
        onError: (error) => {
          if (error instanceof Error && error.message === SALE_CONFLICT_ERROR) {
            alert(
              "Your held slots were no longer available, so your payment has been refunded and no booking was made. Please go back to the sale and try again.",
            );
            return;
          }
          console.error("âŒ Error in payment success handler:", error);
          alert(
            "Payment processing encountered an error. Please refresh the page and verify your payment status.",
          );
        },
      });
    },
    [
      db,
      email,
      firstName,
      lastName,
      birthdate,
      nationality,
      bookingType,
      groupSize,
      tourPackage,
      tourDate,
      selectedPackageName,
      selectedPackageDeposit,
      completedSteps,
      setCompletedSteps,
      setPaymentConfirmed,
      setBookingId,
    ],
  );

  return {
    handlePaymentSuccess,
  };
};

