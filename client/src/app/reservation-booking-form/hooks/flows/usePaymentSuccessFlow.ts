import { useCallback } from "react";
import { SALE_CONFLICT_ERROR, runPaymentSuccessAction } from "../../actions/paymentSuccessAction";
import { markBookingConfirmed } from "../../utils/bookingConfirmedUrl";

type UsePaymentSuccessFlowOptions = {
  email: string;
  tourPackage: string;
  completedSteps: number[];
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
  setPaymentConfirmed: (value: boolean) => void;
  setBookingId: (value: string) => void;
};

export const usePaymentSuccessFlow = ({
  email,
  tourPackage,
  completedSteps,
  setCompletedSteps,
  setPaymentConfirmed,
  setBookingId,
}: UsePaymentSuccessFlowOptions) => {
  const handlePaymentSuccess = useCallback(
    async (paymentIntentId?: string, paymentDocId?: string) => {
      await runPaymentSuccessAction({
        paymentIntentId,
        paymentDocId,
        email,
        tourPackage,
        completedSteps,
        setCompletedSteps,
        setPaymentConfirmed,
        setBookingId,
        onConfirmed: (docId) => markBookingConfirmed(docId),
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
      email,
      tourPackage,
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

