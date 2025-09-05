import dayjs from "dayjs";

export const getAvailableTimes = (start: string, end: string, duration: number, unit: string) => {
    if (!start || !end || !duration || duration <= 0) return [];
    const times: string[] = [];
    const today = dayjs().format('YYYY-MM-DD');
    let current = dayjs(`${today}T${start}`);
    let endTime = dayjs(`${today}T${end}`);
    if (endTime.isBefore(current)) endTime = endTime.add(1, 'day');
    const step = unit === 'hours' ? duration * 60 : duration;
    while (current.isBefore(endTime) || current.isSame(endTime)) {
      times.push(current.format('HH:mm'));
      current = current.add(step, 'minute');
    }
    return times;
  };
 export  const getManualTimes = (_duration: number, _unit: string) => {
    const times: string[] = [];
    const today = dayjs().format('YYYY-MM-DD');
    let current = dayjs(`${today}T00:00`);
    const step = 30;
    const end   = dayjs(`${today}T23:59`);
    while (current.isBefore(end)) {
      times.push(current.format('HH:mm'));
      current = current.add(step, 'minute');
    }
    return times;
  };
  // Days of the week for slot selection
  export const daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];
  export  const calculateEffectivePrice = (basePrice: number, discountType: string, discountValue: number) => {
      if (discountType === 'percentage') {
        return basePrice * (1 - (discountValue / 100));
      } else if (discountType === 'fixed') {
        return Math.max(0, basePrice - discountValue);
      }
      return basePrice;
    };
