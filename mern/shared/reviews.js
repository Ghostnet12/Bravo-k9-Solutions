// Owner-supplied review screenshots. Only confirmed star ratings are recorded.
export const DEFAULT_REVIEWS = [
  {
    id: 'imported-tamyra-borg',
    rating: 5,
    source: 'Google review',
    authorName: 'Tamyra Borg',
    excerpt: 'Absolutely love working with David and Ashley!! Our dog Max is doing great!!',
    body: "Absolutely love working with David and Ashley!! Our dog Max is doing great!! He's learning to work with us, out of choice, love and respect, not because he's going to get a treat, then only obey the trainers commands. Its an absolute joy to see the difference in Max. He's living his best like ❤️🐕 Thank-you so much for all you're doing for us!!!!",
  },
  {
    id: 'imported-waneta-malsom',
    rating: 5,
    source: 'Google review',
    authorName: 'Waneta Malsom',
    excerpt: 'It’s remarkable what they have accomplished in just 4 weeks. They are amazing!!',
    body: 'We just got done with a month of training for our Dogs, Benny and Huck. We moved from a home that had a huge fenced in backyard to a home that doesn’t have any fence at all and we were having trouble with one of our dogs peeing in the house, so we thought we would try Bravo K9 Solutions. Not only have we not had any accidents for a month, they have taught them to be outside without a lease. Didn’t think I would ever see the day that I could open up our back door and just let the dogs out. It’s remarkable what they have accomplished in just 4 weeks. They are amazing!!',
  },

  {
    id: 'imported-cassidy-bierman',
    rating: 5,
    authorName: 'Cassidy Bierman',
    excerpt: 'David & Ashley are both fantastic trainers. Our Great Pyrenees came a long way in basic obedience',
    body: 'David & Ashley are both fantastic trainers. Our Great Pyrenees came a long way in basic obedience & just absolutely melted when they came into her sight. Someone asked David on his first night out with her how long she had been a service dog. They’re very in tune, can read situations before they happen & most importantly... have an abundance of patience 😉 highly recommend!',
  },
  {
    id: 'imported-jessica-post',
    rating: 5,
    authorName: 'Jessica Post',
    excerpt: 'Within 3 weeks we were down to just one accident in a week. Highly recommend!!',
    body: 'They did an excellent job with our daughter’s 5 month old rescue pup. He was having issues with potty training and they informed us he had an obedience issue. Within 3 weeks we were down to just one accident in a week. Highly recommend!!',
  },
  {
    id: 'imported-andrea-leigh-duarte',
    rating: 5,
    authorName: 'Andrea Leigh Duarte',
    excerpt: "I wouldn't go anywhere else for training as long as I can work with David or Ashley",
    body: "David is very knowledgeable and my dogs love him. he helped train my service dog Scout and is currently working with my husband to train our other dog. I wouldn't go anywhere else for training as long as I can work with David or Ashley",
  },
  {
    id: 'imported-justine-harty-west',
    // IMG_9257.jpeg supplied by Bravo’s owner; five star emojis are visible.
    rating: 5,
    source: 'Facebook comment',
    authorName: 'Justine Harty West',
    excerpt: 'They do an awesome job! We highly recommend what they did for our adoptive Star girl.',
    body: "They do an awesome job! We highly recommend what they did for our adoptive Star girl. We love her. 🥰 Can't thank them enough! ⭐⭐⭐⭐⭐",
  },
  {
    id: 'imported-sherrie-humphries',
    authorName: 'Sherrie Humphries',
    source: 'Facebook comment',
    rating: null,
    body: 'Daisy just loves Ashley and David. They are so helpful to us getting her to listen and be disciplined and walk with us not drag us. It all takes a little time and practice but we noticed improvements soon after we started.',
  },
].map((review, order) => ({ source: 'Facebook recommendation', hidden: false, revision: 0, order, ...review }));
