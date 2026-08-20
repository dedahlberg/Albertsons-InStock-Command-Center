const BANNERS={albertsons:{host:'www.albertsons.com',header:'albertsons'},tomthumb:{host:'www.tomthumb.com',header:'tomthumb'},randalls:{host:'www.randalls.com',header:'randalls'},united:{host:'www.unitedsupermarkets.com',header:'unitedsupermarkets'},marketstreet:{host:'www.marketstreetunited.com',header:'marketstreet'}};

async function checkOne(cfg,storeId,productId){
  const base=`https://${cfg.host}`;
  const u=new URL(`${base}/abs/pub/xapi/product/v2/pdpdata`);
  const p={bpn:productId,banner:cfg.header,storeId,bannerId:'6',includeProductRating:'true',realTimeReviewRating:'true',guest:'true',includeOffer:'true',pgm:'abs'};
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u,{headers:{Accept:'application/json',Referer:`${base}/shop/product-details.${productId}.html`,'User-Agent':'Mozilla/5.0 (compatible; Albertsons-InStock-Command-Center/1.0)','x-swy-banner':cfg.header,'x-swy-client-id':'web-portal'}});
  const text=await r.text();
  if(!r.ok)return {productId,ok:false,status:r.status,error:text.slice(0,180)};
  let data;try{data=JSON.parse(text)}catch{return {productId,ok:false,status:502,error:'Non-JSON response'}}
  const doc=data?.catalog?.response?.docs?.[0]||null;
  if(!doc)return {productId,ok:true,found:false,storeId};
  const ci=doc.channelInventory||{};
  return {productId,ok:true,found:true,storeId:doc.storeId||storeId,name:doc.name||null,upc:doc.upc||null,price:doc.price??null,basePrice:doc.basePrice??null,promoEndDate:doc.promoEndDate??null,aisleLocation:doc.aisleLocation??null,inventoryAvailable:doc.inventoryAvailable??null,available:String(doc.inventoryAvailable)==='1',channelInventory:{pickup:ci.pickup??null,delivery:ci.delivery??null,instore:ci.instore??null,shipping:ci.shipping??null}};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  const banner=String(req.query.banner||'tomthumb').toLowerCase();
  const storeId=String(req.query.storeId||req.query.storeid||'').trim();
  const products=String(req.query.products||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,25);
  const cfg=BANNERS[banner];
  if(!cfg)return res.status(400).json({ok:false,error:'Unsupported banner'});
  if(!storeId||!products.length)return res.status(400).json({ok:false,error:'storeId and products are required'});
  try{
    const results=[];
    for(const productId of products){results.push(await checkOne(cfg,storeId,productId));}
    const found=results.filter(x=>x.found);
    const available=found.filter(x=>x.available).length;
    const unavailable=found.filter(x=>x.found&&!x.available).length;
    const unknown=results.filter(x=>!x.found||!x.ok).length;
    const inStockPct=found.length?Math.round(available/found.length*1000)/10:null;
    return res.status(200).json({ok:true,banner,storeId,requested:products.length,found:found.length,available,unavailable,unknown,inStockPct,results});
  }catch(e){return res.status(502).json({ok:false,error:'Batch availability request failed',detail:e?.message||String(e)})}
}
